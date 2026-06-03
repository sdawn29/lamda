import { useEffect, useMemo, useState } from "react"
import { cn } from "@/shared/lib/utils"
import type { DiffMode } from "./types"
import { detectLanguage } from "./highlight"
import { parseDiff } from "./parser"
import { MonacoDiffViewer } from "./monaco-diff-viewer-lazy"
import { DiffHeader } from "./diff-header"

export type { DiffMode }
export { detectLanguage }

interface DiffViewProps {
  diff: string
  filePath?: string
  className?: string
  mode?: DiffMode
  /** Max height of the scrollable diff body. Defaults to 20rem (320px). Pass null to remove the cap. */
  maxHeight?: string | null
  /** Show the file/stats/view-toggle toolbar above the diff. Off by default
   *  so callers that already render their own header are unaffected. */
  showHeader?: boolean
}

export function DiffView({
  diff,
  filePath,
  className,
  mode: modeProp = "inline",
  maxHeight = "20rem",
  showHeader = false,
}: DiffViewProps) {
  // When the toolbar is shown the view mode becomes locally controllable;
  // it stays seeded by (and in sync with) the `mode` prop for callers that
  // drive it externally.
  const [mode, setMode] = useState<DiffMode>(modeProp)
  useEffect(() => setMode(modeProp), [modeProp])

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
        "overflow-hidden rounded-md border border-border/50 bg-card/40 font-mono text-xs",
        className
      )}
    >
      {showHeader && (
        <DiffHeader
          filePath={filePath}
          added={diffBuffers.addedLineNumbers.length}
          removed={diffBuffers.removedLineNumbers.length}
          mode={mode}
          onModeChange={setMode}
        />
      )}
      <MonacoDiffViewer
        original={diffBuffers.original}
        modified={diffBuffers.modified}
        language={language}
        mode={mode}
        maxHeight={maxHeight}
        lineCount={lineCount}
      />
    </div>
  )
}
