import { useCallback, useEffect, useMemo, useRef } from "react"
import { DiffEditor, type BeforeMount } from "@monaco-editor/react"
import type { editor as MonacoEditor } from "monaco-editor"
import { useTheme } from "@/shared/components/theme-provider"
import {
  ensureMonacoEnvironment,
  monaco,
} from "@/features/lsp/monaco/monaco-environment"
import {
  ensureThemes,
  resolveMonacoLanguage,
  themeNameFor,
} from "@/features/lsp/monaco/lsp-integration"
import type { DiffMode } from "./types"

ensureMonacoEnvironment()

interface MonacoDiffViewerProps {
  original: string
  modified: string
  language?: string
  mode: DiffMode
  maxHeight: string | null
  lineCount: number
  removedLineNumbers: number[]
  addedLineNumbers: number[]
}

export default function MonacoDiffViewer({
  original,
  modified,
  language,
  mode,
  maxHeight,
  lineCount,
  removedLineNumbers,
  addedLineNumbers,
}: MonacoDiffViewerProps) {
  const { resolvedTheme } = useTheme()
  const originalLineNumberDecorations =
    useRef<MonacoEditor.IEditorDecorationsCollection | null>(null)
  const modifiedLineNumberDecorations =
    useRef<MonacoEditor.IEditorDecorationsCollection | null>(null)
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
    ensureThemes()
  }, [])

  const updateLineNumberDecorations = useCallback(() => {
    originalLineNumberDecorations.current?.set(
      removedLineNumbers.map((lineNumber) => ({
        range: new monaco.Range(lineNumber, 1, lineNumber, 1),
        options: {
          description: "lamda-diff-removed-line-number",
          isWholeLine: true,
          marginClassName: "lamda-diff-margin-removed",
          lineNumberClassName: "lamda-diff-line-number-removed",
        },
      }))
    )
    modifiedLineNumberDecorations.current?.set(
      addedLineNumbers.map((lineNumber) => ({
        range: new monaco.Range(lineNumber, 1, lineNumber, 1),
        options: {
          description: "lamda-diff-added-line-number",
          isWholeLine: true,
          marginClassName: "lamda-diff-margin-added",
          lineNumberClassName: "lamda-diff-line-number-added",
        },
      }))
    )
  }, [addedLineNumbers, removedLineNumbers])

  const handleMount = useCallback(
    (editor: MonacoEditor.IStandaloneDiffEditor) => {
      originalLineNumberDecorations.current = editor
        .getOriginalEditor()
        .createDecorationsCollection()
      modifiedLineNumberDecorations.current = editor
        .getModifiedEditor()
        .createDecorationsCollection()
      updateLineNumberDecorations()
    },
    [updateLineNumberDecorations]
  )

  useEffect(() => {
    updateLineNumberDecorations()
  }, [updateLineNumberDecorations])

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
      automaticLayout: true,
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
    <div className="lamda-monaco-diff-viewer" style={{ height }}>
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
