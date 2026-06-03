import { memo } from "react"
import { cn } from "@/shared/lib/utils"
import type { CharRange, DiffLine, HighlightMap, ThemeStyle } from "./types"
import { getLineTokens, DiffLineContent } from "./highlight"

interface DiffRowProps {
  line: DiffLine
  diffIndex: number
  map: HighlightMap
  themeStyle: ThemeStyle
  wordDiffRanges?: CharRange[]
}

export const DiffRow = memo(function DiffRow({
  line,
  diffIndex,
  map,
  themeStyle,
  wordDiffRanges,
}: DiffRowProps) {
  const tokens = getLineTokens(line, diffIndex, map)
  const isAdded = line.kind === "added"
  const isRemoved = line.kind === "removed"
  const isNeutral = line.kind === "context" || line.kind === "skipped"

  return (
    <div
      className={cn(
        "group/diff-row flex min-w-full leading-5",
        isAdded && "bg-emerald-500/8 hover:bg-emerald-500/12",
        isRemoved && "bg-rose-500/8 hover:bg-rose-500/12"
      )}
    >
      {/* Gutter */}
      <div
        className={cn(
          "sticky left-0 z-10 flex shrink-0 select-none",
          isAdded &&
            "bg-emerald-50 group-hover/diff-row:bg-emerald-100 dark:bg-emerald-950 dark:group-hover/diff-row:bg-emerald-900",
          isRemoved &&
            "bg-rose-50 group-hover/diff-row:bg-rose-100 dark:bg-rose-950 dark:group-hover/diff-row:bg-rose-900",
          isNeutral && "bg-background"
        )}
      >
        {/* Color strip */}
        <span
          className={cn(
            "w-0.5 shrink-0",
            isAdded && "bg-emerald-500/50",
            isRemoved && "bg-rose-500/50"
          )}
        />

        {/* Old line number */}
        <span
          className={cn(
            "w-7 shrink-0 pr-1.5 text-right font-mono text-[10px] leading-5",
            isRemoved ? "text-rose-400/70" : "text-muted-foreground/30"
          )}
        >
          {line.oldLineNum}
        </span>

        {/* New line number */}
        <span
          className={cn(
            "w-7 shrink-0 border-r pr-1.5 text-right font-mono text-[10px] leading-5",
            isAdded
              ? "border-emerald-500/20 text-emerald-400/70"
              : isRemoved
                ? "border-rose-500/20 text-muted-foreground/20"
                : "border-border/40 text-muted-foreground/30"
          )}
        >
          {line.newLineNum}
        </span>

        {/* Sign indicator */}
        <span
          className={cn(
            "w-4 shrink-0 text-center font-mono text-[11px] leading-5",
            isAdded && "text-emerald-500",
            isRemoved && "text-rose-500",
            isNeutral && "text-muted-foreground/20"
          )}
        >
          {isAdded ? "+" : isRemoved ? "−" : ""}
        </span>
      </div>

      {/* Content */}
      <DiffLineContent
        line={line}
        tokens={tokens}
        themeStyle={themeStyle}
        wordDiffRanges={wordDiffRanges}
        isAdded={isAdded}
        paddingClass="pl-3"
      />
    </div>
  )
})
