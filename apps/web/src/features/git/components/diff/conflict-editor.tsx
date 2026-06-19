import { useCallback, useEffect, useId, useMemo, useRef } from "react"
import Editor, { type BeforeMount, type OnMount } from "@monaco-editor/react"
import type { editor as MonacoEditor, IDisposable, languages as MonacoLanguages } from "monaco-editor"
import { useTheme } from "@/shared/components/theme-provider"
import { ensureMonacoEnvironment } from "@/features/lsp/monaco/monaco-environment"
import {
  applyMonacoTheme,
  ensureThemes,
  resolveMonacoLanguage,
  themeNameFor,
} from "@/features/lsp/monaco/lsp-integration"
import { registerMonacoLayout } from "./monaco-layout-coordinator"

ensureMonacoEnvironment()

interface ConflictEditorProps {
  value: string
  language?: string
  onChange: (value: string) => void
}

type Choice = "current" | "incoming" | "both"

/** A single `<<<<<<< / ======= / >>>>>>>` block, with 1-based line numbers. */
interface ConflictRegion {
  startLine: number // the `<<<<<<<` line
  baseLine: number | null // the `|||||||` line (diff3), if present
  separatorLine: number // the `=======` line
  endLine: number // the `>>>>>>>` line
  current: string[] // "ours" / local hunk
  incoming: string[] // "theirs" / worktree hunk
}

/**
 * Parses git conflict blocks out of `text`. Supports both the default and the
 * diff3 (`|||||||` base section) marker styles. Malformed/half-open blocks are
 * skipped so partial hand-edits never throw.
 */
function parseConflicts(text: string): ConflictRegion[] {
  const lines = text.split("\n")
  const regions: ConflictRegion[] = []
  let i = 0
  while (i < lines.length) {
    if (!lines[i].startsWith("<<<<<<<")) {
      i++
      continue
    }
    const start = i
    let base = -1
    let sep = -1
    let end = -1
    let j = i + 1
    for (; j < lines.length; j++) {
      const line = lines[j]
      if (base === -1 && sep === -1 && line.startsWith("|||||||")) base = j
      else if (sep === -1 && line.startsWith("=======")) sep = j
      else if (line.startsWith(">>>>>>>")) {
        end = j
        break
      }
    }
    if (sep === -1 || end === -1) {
      i = start + 1
      continue
    }
    const currentEnd = base === -1 ? sep : base
    regions.push({
      startLine: start + 1,
      baseLine: base === -1 ? null : base + 1,
      separatorLine: sep + 1,
      endLine: end + 1,
      current: lines.slice(start + 1, currentEnd),
      incoming: lines.slice(sep + 1, end),
    })
    i = end + 1
  }
  return regions
}

function resolvedText(region: ConflictRegion, choice: Choice): string {
  if (choice === "current") return region.current.join("\n")
  if (choice === "incoming") return region.incoming.join("\n")
  return [...region.current, ...region.incoming].join("\n")
}

/**
 * VSCode-style inline merge resolver. The conflicted file is still fully
 * editable, but instead of dumping raw `<<<<<<<` markers we hide the marker
 * text, tint each side's hunk, label them Current (Local) / Incoming
 * (Worktree), and render "Accept" actions as CodeLens links above each block.
 */
export default function ConflictEditor({
  value,
  language,
  onChange,
}: ConflictEditorProps) {
  const { resolvedTheme, activeColorTheme } = useTheme()
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<typeof import("monaco-editor") | null>(null)
  const decorationsRef =
    useRef<MonacoEditor.IEditorDecorationsCollection | null>(null)
  const disposablesRef = useRef<IDisposable[]>([])
  const disposeLayoutRef = useRef<(() => void) | null>(null)

  // Unique model URI per instance so two open editors never share a model and
  // the CodeLens provider (registered per language) can scope itself to ours.
  const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, "")
  const monacoLanguage = useMemo(
    () => (language ? resolveMonacoLanguage(language) : "plaintext"),
    [language]
  )
  const modelPath = useMemo(
    () => `inmemory://lamda-conflict/${instanceId}`,
    [instanceId]
  )

  const beforeMount: BeforeMount = useCallback(() => {
    ensureThemes(activeColorTheme)
  }, [activeColorTheme])

  useEffect(() => {
    applyMonacoTheme(activeColorTheme, resolvedTheme === "dark")
  }, [activeColorTheme, resolvedTheme])

  const refreshDecorations = useCallback(() => {
    const editor = editorRef.current
    const monaco = monacoRef.current
    const model = editor?.getModel()
    if (!editor || !monaco || !model) return
    const decorations: MonacoEditor.IModelDeltaDecoration[] = []

    const tint = (from: number, to: number, className: string) => {
      for (let line = from; line <= to; line++) {
        decorations.push({
          range: new monaco.Range(line, 1, line, 1),
          options: { isWholeLine: true, className },
        })
      }
    }
    const header = (line: number, className: string, label?: string) => {
      decorations.push({
        range: new monaco.Range(line, 1, line, model.getLineMaxColumn(line)),
        options: {
          isWholeLine: true,
          className,
          inlineClassName: "lamda-conflict-marker-hidden",
          before: label
            ? { content: label, inlineClassName: "lamda-conflict-header-label" }
            : undefined,
        },
      })
    }

    for (const region of parseConflicts(model.getValue())) {
      const currentEnd = (region.baseLine ?? region.separatorLine) - 1
      tint(region.startLine + 1, currentEnd, "lamda-conflict-current")
      if (region.baseLine !== null) {
        tint(
          region.baseLine + 1,
          region.separatorLine - 1,
          "lamda-conflict-base"
        )
      }
      tint(
        region.separatorLine + 1,
        region.endLine - 1,
        "lamda-conflict-incoming"
      )

      header(
        region.startLine,
        "lamda-conflict-header-current",
        "Current Change (Local)"
      )
      if (region.baseLine !== null) {
        header(region.baseLine, "lamda-conflict-header-divider", "Base")
      }
      header(
        region.separatorLine,
        "lamda-conflict-header-incoming",
        "Incoming Change (Worktree)"
      )
      header(region.endLine, "lamda-conflict-header-divider")
    }
    decorationsRef.current?.set(decorations)
  }, [])

  const handleMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor
      monacoRef.current = monaco
      decorationsRef.current = editor.createDecorationsCollection([])

      const modelUri = editor.getModel()?.uri.toString() ?? null

      // Applies an Accept choice by replacing the whole conflict block with the
      // chosen side(s). Re-parses the live model so the edit is always against
      // current line numbers, even after earlier resolutions shifted them.
      const applyChoice = (region: ConflictRegion, choice: Choice) => {
        const model = editor.getModel()
        if (!model) return
        editor.executeEdits("merge-conflict", [
          {
            range: new monaco.Range(
              region.startLine,
              1,
              region.endLine,
              model.getLineMaxColumn(region.endLine)
            ),
            text: resolvedText(region, choice),
            forceMoveMarkers: true,
          },
        ])
        editor.focus()
      }

      const commandId = editor.addCommand(0, (_ctx, region, choice) => {
        applyChoice(region as ConflictRegion, choice as Choice)
      })

      const codeLensEmitter = new monaco.Emitter<void>()
      const provider = monaco.languages.registerCodeLensProvider(
        monacoLanguage,
        {
          onDidChange: codeLensEmitter.event,
          provideCodeLenses: (model: MonacoEditor.ITextModel) => {
            if (model.uri.toString() !== modelUri) {
              return { lenses: [], dispose: () => {} }
            }
            const lenses = parseConflicts(model.getValue()).flatMap(
              (region) => {
                const range = new monaco.Range(
                  region.startLine,
                  1,
                  region.startLine,
                  1
                )
                const lens = (title: string, choice: Choice) => ({
                  range,
                  command: commandId
                    ? { id: commandId, title, arguments: [region, choice] }
                    : undefined,
                })
                return [
                  lens("Accept Local", "current"),
                  lens("Accept Worktree", "incoming"),
                  lens("Accept Both", "both"),
                ]
              }
            )
            return { lenses, dispose: () => {} }
          },
          resolveCodeLens: (_model: MonacoEditor.ITextModel, lens: MonacoLanguages.CodeLens) => lens,
        }
      )

      disposablesRef.current.push(provider, codeLensEmitter)
      disposablesRef.current.push(
        editor.onDidChangeModelContent(() => {
          refreshDecorations()
          codeLensEmitter.fire()
        })
      )
      refreshDecorations()

      const el = containerRef.current
      if (el) disposeLayoutRef.current = registerMonacoLayout(el, editor)
    },
    [monacoLanguage, refreshDecorations]
  )

  useEffect(
    () => () => {
      for (const d of disposablesRef.current) d.dispose()
      disposablesRef.current = []
      disposeLayoutRef.current?.()
      disposeLayoutRef.current = null
    },
    []
  )

  return (
    <div ref={containerRef} className="h-full">
      <Editor
        path={modelPath}
        language={monacoLanguage}
        value={value}
        theme={themeNameFor(resolvedTheme === "dark")}
        beforeMount={beforeMount}
        onMount={handleMount}
        onChange={(next) => onChange(next ?? "")}
        keepCurrentModel={false}
        loading={null}
        options={{
          fontSize: 12,
          fontFamily:
            "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          automaticLayout: false,
          lineNumbersMinChars: 3,
          renderLineHighlight: "line",
          smoothScrolling: true,
          codeLens: true,
          padding: { top: 8, bottom: 8 },
          scrollbar: { alwaysConsumeMouseWheel: false },
          stickyScroll: { enabled: false },
          contextmenu: false,
          quickSuggestions: false,
          suggestOnTriggerCharacters: false,
          wordBasedSuggestions: "off",
          overviewRulerLanes: 0,
          overviewRulerBorder: false,
        }}
      />
    </div>
  )
}
