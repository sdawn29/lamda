import { memo } from "react"
import { cn } from "@/shared/lib/utils"
import type { CharRange, DiffLine, HighlightMap, ThemeStyle, WordDiffMap } from "./types"
import { getLineTokens, DiffLineContent } from "./highlight"

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

const SideBySideCell = memo(function SideBySideCell({
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
        isAdded && "bg-diff-add/8",
        isRemoved && "bg-diff-remove/8"
      )}
    >
      {/* Gutter */}
      <div
        className={cn(
          "sticky left-0 z-10 flex shrink-0 select-none",
          isAdded &&
            "bg-[color-mix(in_srgb,var(--diff-add)_12%,var(--background))]",
          isRemoved &&
            "bg-[color-mix(in_srgb,var(--diff-remove)_12%,var(--background))]",
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

        {/* Line number */}
        <span
          className={cn(
            "w-7 shrink-0 border-r pr-1.5 text-right font-mono text-3xs leading-5",
            isAdded && "border-diff-add/20 text-diff-add/80",
            isRemoved && "border-diff-remove/20 text-diff-remove/80",
            isNeutral && "border-border/40 text-muted-foreground/30"
          )}
        >
          {isSkipped ? "" : lineNum}
        </span>

        {/* Sign */}
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
        paddingClass="pl-2"
      />
    </div>
  )
})

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
