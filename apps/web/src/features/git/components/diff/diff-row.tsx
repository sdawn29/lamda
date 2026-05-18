import { cn } from "@/shared/lib/utils"
import type { CharRange, DiffLine, HighlightMap, ThemeStyle } from "./types"
import { getLineTokens, renderTokens } from "./highlight"
import { renderWithWordDiff } from "./word-diff"

interface DiffRowProps {
  line: DiffLine
  diffIndex: number
  map: HighlightMap
  themeStyle: ThemeStyle
  wordDiffRanges?: CharRange[]
}

export function DiffRow({
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
        isAdded && "bg-green-500/8 hover:bg-green-500/12",
        isRemoved && "bg-red-500/8 hover:bg-red-500/12"
      )}
    >
      {/* Gutter */}
      <div
        className={cn(
          "sticky left-0 z-10 flex shrink-0 select-none",
          isAdded &&
            "bg-green-50 group-hover/diff-row:bg-green-100 dark:bg-green-950 dark:group-hover/diff-row:bg-green-900",
          isRemoved &&
            "bg-red-50 group-hover/diff-row:bg-red-100 dark:bg-red-950 dark:group-hover/diff-row:bg-red-900",
          isNeutral && "bg-background"
        )}
      >
        {/* Color strip */}
        <span
          className={cn(
            "w-0.5 shrink-0",
            isAdded && "bg-green-500/50",
            isRemoved && "bg-red-500/50"
          )}
        />

        {/* Old line number */}
        <span
          className={cn(
            "w-7 shrink-0 pr-1.5 text-right font-mono text-[10px] leading-5",
            isRemoved ? "text-red-400/70" : "text-muted-foreground/30"
          )}
        >
          {line.oldLineNum}
        </span>

        {/* New line number */}
        <span
          className={cn(
            "w-7 shrink-0 border-r pr-1.5 text-right font-mono text-[10px] leading-5",
            isAdded
              ? "border-green-500/20 text-green-400/70"
              : isRemoved
                ? "border-red-500/20 text-muted-foreground/20"
                : "border-border/40 text-muted-foreground/30"
          )}
        >
          {line.newLineNum}
        </span>

        {/* Sign indicator */}
        <span
          className={cn(
            "w-4 shrink-0 text-center font-mono text-[11px] leading-5",
            isAdded && "text-green-500",
            isRemoved && "text-red-500",
            isNeutral && "text-muted-foreground/20"
          )}
        >
          {isAdded ? "+" : isRemoved ? "−" : ""}
        </span>
      </div>

      {/* Content */}
      <span
        className={cn(
          "w-max shrink-0 pl-3 whitespace-pre",
          line.kind === "skipped" && "font-mono text-[10px] italic text-muted-foreground/40"
        )}
      >
        {line.kind === "skipped" ? (
          "⋯"
        ) : wordDiffRanges && wordDiffRanges.length > 0 ? (
          renderWithWordDiff(line.content, wordDiffRanges).map((part, i) =>
            part.highlighted ? (
              <span
                key={i}
                className={cn(
                  "rounded-sm",
                  isAdded
                    ? "bg-green-500/30 dark:bg-green-400/25"
                    : "bg-red-500/30 dark:bg-red-400/25"
                )}
              >
                {part.text}
              </span>
            ) : (
              <span key={i}>{part.text}</span>
            )
          )
        ) : (
          renderTokens(tokens, themeStyle)
        )}
      </span>
    </div>
  )
}
