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
        isAdded && "bg-diff-add/14 hover:bg-diff-add/20",
        isRemoved && "bg-diff-remove/14 hover:bg-diff-remove/20"
      )}
    >
      {/* Gutter */}
      <div
        className={cn(
          "sticky left-0 z-10 flex shrink-0 select-none",
          isAdded &&
            "bg-[color-mix(in_srgb,var(--diff-add)_18%,var(--background))] group-hover/diff-row:bg-[color-mix(in_srgb,var(--diff-add)_30%,var(--background))]",
          isRemoved &&
            "bg-[color-mix(in_srgb,var(--diff-remove)_18%,var(--background))] group-hover/diff-row:bg-[color-mix(in_srgb,var(--diff-remove)_30%,var(--background))]",
          isNeutral && "bg-background"
        )}
      >
        {/* Color strip */}
        <span
          className={cn(
            "w-0.5 shrink-0",
            isAdded && "bg-diff-add/50",
            isRemoved && "bg-diff-remove/50"
          )}
        />

        {/* Old line number */}
        <span
          className={cn(
            "w-7 shrink-0 pr-1.5 text-right font-mono text-3xs leading-5",
            isRemoved ? "text-diff-remove/70" : "text-muted-foreground/30"
          )}
        >
          {line.oldLineNum}
        </span>

        {/* New line number */}
        <span
          className={cn(
            "w-7 shrink-0 border-r pr-1.5 text-right font-mono text-3xs leading-5",
            isAdded
              ? "border-diff-add/20 text-diff-add/80"
              : isRemoved
                ? "border-diff-remove/20 text-muted-foreground/20"
                : "border-border/40 text-muted-foreground/30"
          )}
        >
          {line.newLineNum}
        </span>

        {/* Sign indicator */}
        <span
          className={cn(
            "w-4 shrink-0 text-center font-mono text-2xs leading-5",
            isAdded && "text-diff-add",
            isRemoved && "text-diff-remove",
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
