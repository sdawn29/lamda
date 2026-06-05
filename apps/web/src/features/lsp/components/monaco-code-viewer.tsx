/**
 * Monaco-backed read-only code viewer: syntax highlighting, LSP diagnostics
 * (as markers), hover, cmd/ctrl-click go-to-definition, scroll-to-line, and the
 * inline "add comment to chat" composer (rendered into a Monaco view zone).
 *
 * Monaco virtualizes rendering, so large files stay smooth.
 */
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react"
import Editor, { type OnMount, type BeforeMount } from "@monaco-editor/react"
import type { editor as MonacoEditor, IDisposable } from "monaco-editor"
import { useTheme } from "@/shared/components/theme-provider"
import { Button } from "@/shared/ui/button"
import { Card, CardContent } from "@/shared/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/shared/ui/field"
import { Textarea } from "@/shared/ui/textarea"
import type { Diagnostic } from "../types"
import { LspConnection } from "../client"
import { ensureMonacoEnvironment } from "../monaco/monaco-environment"
import {
  applyMonacoTheme,
  diagnosticsToMarkers,
  ensureLspProviders,
  ensureThemes,
  registerModelLsp,
  resolveMonacoLanguage,
  themeNameFor,
  unregisterModelLsp,
} from "../monaco/lsp-integration"
import type { ModelLspEntry } from "../monaco/lsp-integration"

// Point @monaco-editor/react at the bundled monaco (no CDN) before its loader
// initializes. Must happen at module load, ahead of the first <Editor> render.
ensureMonacoEnvironment()

interface MonacoCodeViewerProps {
  code: string
  language: string
  fontSize?: string
  diagnostics: Diagnostic[]
  connection: LspConnection | null
  filePath: string | null
  onOpenFile?: (filePath: string, title: string, line?: number) => void
  onAddCommentContext?: (context: {
    filePath: string
    line: number
    comment: string
    code?: string
  }) => void
  /** External request to scroll to a given 1-indexed line. */
  scrollToLine?: number | null
}

const MARKER_OWNER = "lsp"
const COMPOSER_HEIGHT = 188

function targetLineNumber(target: MonacoEditor.IMouseTarget): number | null {
  return (
    target.position?.lineNumber ?? target.range?.startLineNumber ?? null
  )
}

/** Convert a CSS font-size ("0.75rem", "12px", "13") to a Monaco px number. */
function toPx(fontSize: string | undefined): number {
  if (!fontSize) return 12
  const rem = /^([\d.]+)rem$/.exec(fontSize)
  if (rem) return Math.round(parseFloat(rem[1]) * 16)
  const px = /^([\d.]+)px$/.exec(fontSize)
  if (px) return Math.round(parseFloat(px[1]))
  const n = parseFloat(fontSize)
  return Number.isFinite(n) ? n : 12
}

export default function MonacoCodeViewer({
  code,
  language,
  fontSize = "0.75rem",
  diagnostics,
  connection,
  filePath,
  onOpenFile,
  onAddCommentContext,
  scrollToLine,
}: MonacoCodeViewerProps) {
  const { resolvedTheme, activeColorTheme } = useTheme()
  const isDark = resolvedTheme === "dark"

  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<typeof import("monaco-editor") | null>(null)
  const disposablesRef = useRef<IDisposable[]>([])
  const registeredModelUriRef = useRef<string | null>(null)

  const commentEnabled = !!onAddCommentContext && !!filePath

  // Mutable refs so the (once-registered) Monaco providers/handlers always see
  // fresh props without re-binding. The registry holds this same `lspEntry`
  // object, so mutating its fields keeps the hover/definition providers and the
  // editor opener current.
  const lspEntry = useRef<ModelLspEntry>({
    connection: null,
    filePath: null,
    onOpenFile: undefined,
  })
  const onAddCommentRef = useRef(onAddCommentContext)
  const codeRef = useRef(code)
  const commentEnabledRef = useRef(commentEnabled)
  useEffect(() => {
    lspEntry.current.connection = connection
    lspEntry.current.filePath = filePath
    lspEntry.current.onOpenFile = onOpenFile
    onAddCommentRef.current = onAddCommentContext
    codeRef.current = code
    commentEnabledRef.current = commentEnabled
  })

  // Stable, unique model URI per viewer instance so two open viewers never
  // share (and fight over) a model.
  const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, "")
  const modelPath = useMemo(
    () => `inmemory://lamda/${instanceId}/${filePath ?? "untitled"}`,
    [instanceId, filePath]
  )
  const monacoLanguage = useMemo(
    () => resolveMonacoLanguage(language),
    [language]
  )

  // ── Inline comment composer ─────────────────────────────────────────────────
  // An empty Monaco view zone reserves vertical space after the target line; the
  // composer itself is a normal React overlay rendered OUTSIDE Monaco's DOM and
  // positioned over that gap. Keeping it out of the editor avoids Monaco's
  // focus/keyboard handling stealing input (view-zone DOM is unreliable for
  // interactive widgets).
  const [composerLine, setComposerLine] = useState<number | null>(null)
  const [commentText, setCommentText] = useState("")
  const [composerTop, setComposerTop] = useState(0)
  const zoneIdRef = useRef<string | null>(null)

  const closeComposer = useCallback(() => {
    setComposerLine(null)
    setCommentText("")
  }, [])

  const openComposer = useCallback((line: number) => {
    setCommentText("")
    setComposerLine(line)
  }, [])

  const submitComment = useCallback(() => {
    const line = composerLine
    const fp = lspEntry.current.filePath
    if (line == null || !fp || !commentText.trim()) return
    onAddCommentRef.current?.({
      filePath: fp,
      line,
      comment: commentText.trim(),
      code: codeRef.current.split("\n")[line - 1]?.trim() ?? "",
    })
    closeComposer()
  }, [composerLine, commentText, closeComposer])

  // Reserve space with an empty view zone and keep the overlay aligned to it as
  // the editor scrolls or relays out.
  useEffect(() => {
    const editor = editorRef.current
    if (!editor || composerLine == null) return
    const spacer = document.createElement("div")
    editor.changeViewZones((acc) => {
      if (zoneIdRef.current) acc.removeZone(zoneIdRef.current)
      zoneIdRef.current = acc.addZone({
        afterLineNumber: composerLine,
        heightInPx: COMPOSER_HEIGHT,
        domNode: spacer,
      })
    })

    const updateTop = () => {
      const ed = editorRef.current
      if (!ed) return
      // The zone sits directly after composerLine, so its top in content
      // coordinates is that line's bottom. Convert to viewport coordinates.
      setComposerTop(
        ed.getBottomForLineNumber(composerLine) - ed.getScrollTop()
      )
    }
    const raf = requestAnimationFrame(updateTop)
    const d1 = editor.onDidScrollChange(updateTop)
    const d2 = editor.onDidLayoutChange(updateTop)

    return () => {
      cancelAnimationFrame(raf)
      d1.dispose()
      d2.dispose()
      const ed = editorRef.current
      if (ed && zoneIdRef.current) {
        const id = zoneIdRef.current
        ed.changeViewZones((acc) => acc.removeZone(id))
        zoneIdRef.current = null
      }
    }
  }, [composerLine])

  const beforeMount: BeforeMount = useCallback(() => {
    ensureThemes(activeColorTheme)
    ensureLspProviders()
  }, [activeColorTheme])

  // Re-skin the editor (and all native widgets) when the color theme or mode
  // changes. The theme name stays stable, so redefining + setTheme refreshes
  // any already-mounted editor live.
  useEffect(() => {
    applyMonacoTheme(activeColorTheme, isDark)
  }, [activeColorTheme, isDark])

  const syncModelRegistration = useCallback(() => {
    const modelUri = editorRef.current?.getModel()?.uri.toString() ?? null
    const previousUri = registeredModelUriRef.current
    if (previousUri === modelUri) return

    if (previousUri) unregisterModelLsp(previousUri)
    if (modelUri) registerModelLsp(modelUri, lspEntry.current)
    registeredModelUriRef.current = modelUri
  }, [])

  const handleMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor
      monacoRef.current = monaco

      syncModelRegistration()
      disposablesRef.current.push(editor.onDidChangeModel(syncModelRegistration))

      const editorDomNode = editor.getDomNode()
      const clearFindCloseTooltip = () => {
        const closeButton = editorDomNode?.querySelector<HTMLElement>(
          ".find-widget > .button.codicon-widget-close"
        )
        closeButton?.removeAttribute("title")
        closeButton?.removeAttribute("aria-label")
      }
      clearFindCloseTooltip()
      if (editorDomNode) {
        const observer = new MutationObserver(clearFindCloseTooltip)
        observer.observe(editorDomNode, {
          attributes: true,
          childList: true,
          subtree: true,
        })
        disposablesRef.current.push({ dispose: () => observer.disconnect() })
      }

      // "+" that overlays the line number of the hovered line.
      const glyphCollection = editor.createDecorationsCollection([])
      let hoveredLine = -1
      disposablesRef.current.push(
        editor.onMouseMove((e) => {
          if (!commentEnabledRef.current) return
          const line = targetLineNumber(e.target) ?? -1
          if (line === hoveredLine) return
          hoveredLine = line
          glyphCollection.set(
            line > 0
              ? [
                  {
                    range: new monaco.Range(line, 1, line, 1),
                    options: {
                      lineNumberClassName: "lamda-add-comment-line",
                    },
                  },
                ]
              : []
          )
        })
      )
      disposablesRef.current.push(
        editor.onMouseLeave(() => {
          hoveredLine = -1
          glyphCollection.set([])
        })
      )

      // Open the inline comment composer when a line number is clicked.
      // Go-to-definition (cmd/ctrl-click, F12, peek) is handled natively by
      // Monaco via the registered definition provider + editor opener.
      disposablesRef.current.push(
        editor.onMouseDown((e) => {
          const line = targetLineNumber(e.target)
          if (
            commentEnabledRef.current &&
            e.target.type === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS &&
            line
          ) {
            openComposer(line)
          }
        })
      )
    },
    [openComposer, syncModelRegistration]
  )

  useEffect(() => {
    syncModelRegistration()
  }, [modelPath, syncModelRegistration])

  // Push LSP diagnostics into Monaco as markers.
  useEffect(() => {
    const editor = editorRef.current
    const monaco = monacoRef.current
    const model = editor?.getModel()
    if (!editor || !monaco || !model) return
    monaco.editor.setModelMarkers(
      model,
      MARKER_OWNER,
      diagnosticsToMarkers(diagnostics)
    )
  }, [diagnostics, code])

  // Scroll-to-line with a brief highlight flash.
  useEffect(() => {
    const editor = editorRef.current
    const monaco = monacoRef.current
    if (!editor || !monaco || !scrollToLine) return
    editor.revealLineInCenter(scrollToLine)
    const flash = editor.createDecorationsCollection([
      {
        range: new monaco.Range(scrollToLine, 1, scrollToLine, 1),
        options: {
          isWholeLine: true,
          className: "lamda-scroll-flash",
        },
      },
    ])
    const t = window.setTimeout(() => flash.clear(), 700)
    return () => window.clearTimeout(t)
  }, [scrollToLine])

  // Tear down handlers + registry entry on unmount.
  useEffect(() => {
    return () => {
      for (const d of disposablesRef.current) d.dispose()
      disposablesRef.current = []
      if (registeredModelUriRef.current) {
        unregisterModelLsp(registeredModelUriRef.current)
        registeredModelUriRef.current = null
      }
    }
  }, [])

  const composer =
    composerLine != null ? (
      <div
        className="absolute right-2 left-12 z-20"
        style={{ top: composerTop }}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault()
            submitComment()
          } else if (e.key === "Escape") {
            e.preventDefault()
            closeComposer()
          }
        }}
      >
        <Card
          size="sm"
          className="animate-in gap-0 bg-popover p-0 font-sans whitespace-normal text-popover-foreground shadow-md duration-150 fade-in-0 slide-in-from-top-2"
        >
          <CardContent className="flex flex-col gap-1 py-1">
            <FieldGroup className="gap-1">
              <Field className="gap-1">
                <FieldLabel htmlFor={`${instanceId}-comment`}>
                  Comment
                </FieldLabel>
                <Textarea
                  id={`${instanceId}-comment`}
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="What should the agent know about this line?"
                  className="min-h-20 text-xs"
                  autoFocus
                />
                <FieldDescription className="text-[10px]">
                  Saved into chat as file context.
                </FieldDescription>
              </Field>
            </FieldGroup>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="default"
                onClick={closeComposer}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="default"
                disabled={!commentText.trim()}
                onClick={submitComment}
              >
                Add context
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    ) : null

  return (
    <div className="relative h-full overflow-hidden">
      <Editor
        path={modelPath}
        defaultLanguage={monacoLanguage}
        language={monacoLanguage}
        value={code}
        theme={themeNameFor(isDark)}
        beforeMount={beforeMount}
        onMount={handleMount}
        keepCurrentModel={false}
        loading={null}
        options={{
          readOnly: true,
          domReadOnly: true,
          fontSize: toPx(fontSize),
          fontFamily:
            "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          glyphMargin: false,
          lineNumbersMinChars: 3,
          renderLineHighlight: "none",
          multiCursorModifier: "alt",
          smoothScrolling: true,
          automaticLayout: true,
          padding: { top: 8, bottom: 8 },
          scrollbar: { alwaysConsumeMouseWheel: false },
          stickyScroll: { enabled: false },
          // Strip Monaco's extra built-in features; this viewer only wants
          // syntax highlighting plus the LSP hover/definition and comment
          // composer wired up above.
          contextmenu: false,
          links: false,
          folding: false,
          codeLens: false,
          lightbulb: { enabled: "off" as MonacoEditor.ShowLightbulbIconMode },
          inlayHints: { enabled: "off" },
          quickSuggestions: false,
          suggestOnTriggerCharacters: false,
          parameterHints: { enabled: false },
          wordBasedSuggestions: "off",
          snippetSuggestions: "none",
          occurrencesHighlight: "off",
          selectionHighlight: false,
          matchBrackets: "never",
          renderWhitespace: "none",
          guides: { indentation: false, bracketPairs: false },
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          overviewRulerBorder: false,
        }}
      />
      {composer}
    </div>
  )
}
