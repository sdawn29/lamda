import { useMemo } from "react"
import { cn } from "@/shared/lib/utils"
import type { DiffMode } from "./types"
import { detectLanguage } from "./highlight"
import { parseDiff } from "./parser"
import { MonacoDiffViewer } from "./monaco-diff-viewer-lazy"

export type { DiffMode }
export { detectLanguage }

interface DiffViewProps {
  diff: string
  filePath?: string
  className?: string
  mode?: DiffMode
  /** Max height of the scrollable diff body. Defaults to 20rem (320px). Pass null to remove the cap. */
  maxHeight?: string | null
}

export function DiffView({
  diff,
  filePath,
  className,
  mode = "inline",
  maxHeight = "20rem",
}: DiffViewProps) {
  const lines = useMemo(() => parseDiff(diff), [diff])
  const diffBuffers = useMemo(() => {
    const originalLines: string[] = []
    const modifiedLines: string[] = []
    const removedLineNumbers: number[] = []
    const addedLineNumbers: number[] = []

    for (const line of lines) {
      if (line.kind === "context") {
        originalLines.push(line.content)
        modifiedLines.push(line.content)
      } else if (line.kind === "removed") {
        originalLines.push(line.content)
        removedLineNumbers.push(originalLines.length)
      } else if (line.kind === "added") {
        modifiedLines.push(line.content)
        addedLineNumbers.push(modifiedLines.length)
      }
    }

    return {
      original: originalLines.join("\n"),
      modified: modifiedLines.join("\n"),
      removedLineNumbers,
      addedLineNumbers,
    }
  }, [lines])
  const language = useMemo(
    () => (filePath ? (detectLanguage(filePath) ?? undefined) : undefined),
    [filePath]
  )
  const lineCount = Math.max(
    4,
    diffBuffers.original === "" ? 0 : diffBuffers.original.split("\n").length,
    diffBuffers.modified === "" ? 0 : diffBuffers.modified.split("\n").length
  )

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border/60 bg-background font-mono text-xs",
        className
      )}
    >
      <MonacoDiffViewer
        original={diffBuffers.original}
        modified={diffBuffers.modified}
        language={language}
        mode={mode}
        maxHeight={maxHeight}
        lineCount={lineCount}
        removedLineNumbers={diffBuffers.removedLineNumbers}
        addedLineNumbers={diffBuffers.addedLineNumbers}
      />
    </div>
  )
}
