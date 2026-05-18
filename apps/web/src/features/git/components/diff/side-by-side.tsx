import { cn } from "@/shared/lib/utils"
import type { CharRange, DiffLine, HighlightMap, ThemeStyle, WordDiffMap } from "./types"
import { getLineTokens, renderTokens } from "./highlight"
import { renderWithWordDiff } from "./word-diff"

export interface SideBySideRow {
  left: { line: DiffLine; diffIndex: number } | null
  right: { line: DiffLine; diffIndex: number } | null
}

export function buildSideBySideRows(lines: DiffLine[]): SideBySideRow[] {
  const rows: SideBySideRow[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.kind === "context" || line.kind === "skipped") {
      rows.push({ left: { line, diffIndex: i }, right: { line, diffIndex: i } })
      i++
      continue
    }

    const removed: { line: DiffLine; diffIndex: number }[] = []
    const added: { line: DiffLine; diffIndex: number }[] = []

    while (i < lines.length && lines[i].kind === "removed") {
      removed.push({ line: lines[i], diffIndex: i })
      i++
    }
    while (i < lines.length && lines[i].kind === "added") {
      added.push({ line: lines[i], diffIndex: i })
      i++
    }

    const maxLen = Math.max(removed.length, added.length)
    for (let j = 0; j < maxLen; j++) {
      rows.push({ left: removed[j] ?? null, right: added[j] ?? null })
    }
  }

  return rows
}

function SideBySideCell({
  entry,
  map,
  themeStyle,
  wordDiffRanges,
  side,
}: {
  entry: { line: DiffLine; diffIndex: number } | null
  map: HighlightMap
  themeStyle: ThemeStyle
  wordDiffRanges?: CharRange[]
  side: "left" | "right"
}) {
  if (!entry) {
    return <div className="h-5 min-w-full" />
  }

  const { line, diffIndex } = entry
  const isSkipped = line.kind === "skipped"
  const isAdded = line.kind === "added"
  const isRemoved = line.kind === "removed"
  const isNeutral = line.kind === "context" || isSkipped
  const tokens = getLineTokens(line, diffIndex, map)
  const lineNum = side === "left" ? line.oldLineNum : line.newLineNum

  return (
    <div
      className={cn(
        "flex min-w-full leading-5",
        isAdded && "bg-green-500/8",
        isRemoved && "bg-red-500/8"
      )}
    >
      {/* Gutter */}
      <div
        className={cn(
          "sticky left-0 z-10 flex shrink-0 select-none",
          isAdded && "bg-green-50 dark:bg-green-950",
          isRemoved && "bg-red-50 dark:bg-red-950",
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

        {/* Line number */}
        <span
          className={cn(
            "w-7 shrink-0 border-r pr-1.5 text-right font-mono text-[10px] leading-5",
            isAdded && "border-green-500/20 text-green-400/70",
            isRemoved && "border-red-500/20 text-red-400/70",
            isNeutral && "border-border/40 text-muted-foreground/30"
          )}
        >
          {isSkipped ? "" : lineNum}
        </span>

        {/* Sign */}
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
          "w-max shrink-0 pl-2 whitespace-pre",
          isSkipped && "font-mono text-[10px] italic text-muted-foreground/40"
        )}
      >
        {isSkipped ? (
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

function SideBySideColumn({
  entries,
  map,
  themeStyle,
  wordDiffMap,
  side,
}: {
  entries: Array<{ line: DiffLine; diffIndex: number } | null>
  map: HighlightMap
  themeStyle: ThemeStyle
  wordDiffMap: WordDiffMap
  side: "left" | "right"
}) {
  return (
    <div className="min-w-0 overflow-x-auto">
      <div className="w-max min-w-full">
        {entries.map((entry, index) => (
          <SideBySideCell
            key={index}
            entry={entry}
            map={map}
            themeStyle={themeStyle}
            side={side}
            wordDiffRanges={
              entry
                ? side === "left"
                  ? wordDiffMap.removed.get(entry.diffIndex)
                  : wordDiffMap.added.get(entry.diffIndex)
                : undefined
            }
          />
        ))}
      </div>
    </div>
  )
}

export function SideBySideView({
  rows,
  map,
  themeStyle,
  wordDiffMap,
}: {
  rows: SideBySideRow[]
  map: HighlightMap
  themeStyle: ThemeStyle
  wordDiffMap: WordDiffMap
}) {
  return (
    <div className="grid min-w-0 grid-cols-2 divide-x divide-border/30">
      <SideBySideColumn
        entries={rows.map((row) => row.left)}
        map={map}
        themeStyle={themeStyle}
        wordDiffMap={wordDiffMap}
        side="left"
      />
      <SideBySideColumn
        entries={rows.map((row) => row.right)}
        map={map}
        themeStyle={themeStyle}
        wordDiffMap={wordDiffMap}
        side="right"
      />
    </div>
  )
}
