import { useCallback, useEffect, useMemo, useRef } from "react"
import {
  DiffEditor,
  type BeforeMount,
  type DiffOnMount,
} from "@monaco-editor/react"
import type { editor as MonacoEditor } from "monaco-editor"
import { useTheme } from "@/shared/components/theme-provider"
import { ensureMonacoEnvironment } from "@/features/lsp/monaco/monaco-environment"
import {
  applyMonacoTheme,
  ensureThemes,
  resolveMonacoLanguage,
  themeNameFor,
} from "@/features/lsp/monaco/lsp-integration"
import { registerMonacoLayout } from "./monaco-layout-coordinator"
import type { DiffMode } from "./types"

ensureMonacoEnvironment()

interface MonacoDiffViewerProps {
  original: string
  modified: string
  language?: string
  mode: DiffMode
  maxHeight: string | null
  lineCount: number
}

export default function MonacoDiffViewer({
  original,
  modified,
  language,
  mode,
  maxHeight,
  lineCount,
}: MonacoDiffViewerProps) {
  const { resolvedTheme, activeColorTheme } = useTheme()
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<MonacoEditor.IStandaloneDiffEditor | null>(null)
  const monacoLanguage = useMemo(
    () => (language ? resolveMonacoLanguage(language) : undefined),
    [language]
  )
  const height = useMemo(() => {
    if (maxHeight === null) return "100%"
    const contentHeight = Math.min(Math.max(lineCount * 20 + 16, 96), 800)
    return `min(${contentHeight}px, ${maxHeight})`
  }, [lineCount, maxHeight])

  const beforeMount: BeforeMount = useCallback(() => {
    ensureThemes(activeColorTheme)
  }, [activeColorTheme])

  // Re-skin live when the color theme or mode changes.
  useEffect(() => {
    applyMonacoTheme(activeColorTheme, resolvedTheme === "dark")
  }, [activeColorTheme, resolvedTheme])

  // Drive layout via the shared coordinator instead of Monaco's per-editor
  // `automaticLayout`, so a window resize triggers a single batched pass
  // across all mounted diffs rather than N synchronous relayouts. Monaco
  // mounts asynchronously and gives no unmount hook, so we register inside
  // onMount and keep the disposer in a ref. A mode change remounts the editor
  // (keyed below) and re-fires onMount, which disposes the prior registration.
  const disposeLayoutRef = useRef<(() => void) | null>(null)
  const handleMount: DiffOnMount = useCallback((editor) => {
    editorRef.current = editor
    const el = containerRef.current
    if (!el) return
    disposeLayoutRef.current?.()
    disposeLayoutRef.current = registerMonacoLayout(el, editor)
  }, [])

  useEffect(
    () => () => {
      disposeLayoutRef.current?.()
      disposeLayoutRef.current = null
    },
    []
  )

  const options: MonacoEditor.IDiffEditorConstructionOptions = useMemo(
    () => ({
      readOnly: true,
      domReadOnly: true,
      renderSideBySide: mode === "side-by-side",
      useInlineViewWhenSpaceIsLimited: false,
      renderIndicators: false,
      renderMarginRevertIcon: false,
      renderGutterMenu: false,
      renderOverviewRuler: false,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      automaticLayout: false,
      fontSize: 12,
      fontFamily:
        "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
      lineNumbersMinChars: 3,
      renderLineHighlight: "none",
      scrollbar: { alwaysConsumeMouseWheel: false },
      stickyScroll: { enabled: false },
      originalEditable: false,
      diffWordWrap: "off",
      ignoreTrimWhitespace: false,
    }),
    [mode]
  )

  return (
    <div
      ref={containerRef}
      className="lamda-monaco-diff-viewer"
      style={{ height }}
    >
      <DiffEditor
        key={mode}
        language={monacoLanguage}
        original={original}
        modified={modified}
        theme={themeNameFor(resolvedTheme === "dark")}
        beforeMount={beforeMount}
        onMount={handleMount}
        options={options}
        loading={null}
      />
    </div>
  )
}
