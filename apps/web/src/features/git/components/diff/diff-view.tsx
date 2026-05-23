import { useEffect, useMemo, useRef, useState } from "react"
import { cn } from "@/shared/lib/utils"
import { jellybeansdark, jellybeanslight } from "@/shared/lib/syntax-theme"
import { useTheme } from "@/shared/components/theme-provider"
import type { DiffLine, DiffMode, HighlightMap, ThemeStyle, WordDiffMap } from "./types"
import { buildHighlightMap, detectLanguage } from "./highlight"
import { parseDiff } from "./parser"
import { DiffRow } from "./diff-row"
import { buildSideBySideRows, SideBySideView } from "./side-by-side"
import { buildWordDiffMap } from "./word-diff"

export type { DiffMode }
export { detectLanguage }

const DIFF_ROW_HEIGHT_PX = 20
const DIFF_OVERSCAN_ROWS = 40
const MAX_SYNTAX_HIGHLIGHT_LINES = 1200

const EMPTY_HIGHLIGHT_MAP: HighlightMap = {
  newLines: [],
  oldLines: [],
  newLineIndex: [],
  oldLineIndex: [],
}
const EMPTY_WORD_DIFF_MAP: WordDiffMap = { removed: new Map(), added: new Map() }

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
  const { theme } = useTheme()
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)
  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches)
  const themeStyle = (isDark ? jellybeansdark : jellybeanslight) as ThemeStyle

  const lines = useMemo(() => parseDiff(diff), [diff])

  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return

    const updateViewportHeight = () => {
      setViewportHeight(el.clientHeight)
      setScrollTop(el.scrollTop)
    }

    updateViewportHeight()

    const observer = new ResizeObserver(() => {
      updateViewportHeight()
    })
    observer.observe(el)

    return () => observer.disconnect()
  }, [])

  // Clean up any pending RAF on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const language = useMemo(
    () => (filePath ? detectLanguage(filePath) : null),
    [filePath]
  )
  const highlightLanguage = useMemo(
    () => (lines.length > MAX_SYNTAX_HIGHLIGHT_LINES ? null : language),
    [language, lines.length]
  )

  // Deferred enrichment: compute syntax highlighting and word-diff after the
  // initial paint so the diff rows appear immediately even for very large diffs.
  const [enrichedMaps, setEnrichedMaps] = useState<{
    forLines: DiffLine[]
    highlightMap: HighlightMap
    wordDiffMap: WordDiffMap
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    const id = setTimeout(() => {
      if (cancelled) return
      const highlightMap = buildHighlightMap(lines, highlightLanguage)
      const wordDiffMap = buildWordDiffMap(lines)
      if (!cancelled) setEnrichedMaps({ forLines: lines, highlightMap, wordDiffMap })
    }, 0)
    return () => {
      cancelled = true
      clearTimeout(id)
    }
  }, [lines, highlightLanguage])

  // Only use enriched maps when they were computed for the current lines to
  // avoid index mismatches during transitions.
  const highlightMap =
    enrichedMaps?.forLines === lines ? enrichedMaps.highlightMap : EMPTY_HIGHLIGHT_MAP
  const wordDiffMap: WordDiffMap =
    enrichedMaps?.forLines === lines ? enrichedMaps.wordDiffMap : EMPTY_WORD_DIFF_MAP

  const sideBySideRows = useMemo(() => {
    if (mode !== "side-by-side") return null
    return buildSideBySideRows(lines)
  }, [lines, mode])

  const rowCount =
    mode === "side-by-side" ? (sideBySideRows?.length ?? 0) : lines.length
  const { startIndex, endIndex, topSpacerHeight, bottomSpacerHeight } =
    useMemo(() => {
      if (rowCount === 0) {
        return {
          startIndex: 0,
          endIndex: 0,
          topSpacerHeight: 0,
          bottomSpacerHeight: 0,
        }
      }

      const firstVisibleRow = Math.floor(scrollTop / DIFF_ROW_HEIGHT_PX)
      const visibleRowCount = Math.max(
        Math.ceil(
          Math.max(viewportHeight, DIFF_ROW_HEIGHT_PX) / DIFF_ROW_HEIGHT_PX
        ),
        1
      )
      const startIndex = Math.max(firstVisibleRow - DIFF_OVERSCAN_ROWS, 0)
      const endIndex = Math.min(
        firstVisibleRow + visibleRowCount + DIFF_OVERSCAN_ROWS,
        rowCount
      )

      return {
        startIndex,
        endIndex,
        topSpacerHeight: startIndex * DIFF_ROW_HEIGHT_PX,
        bottomSpacerHeight: Math.max(
          (rowCount - endIndex) * DIFF_ROW_HEIGHT_PX,
          0
        ),
      }
    }, [rowCount, scrollTop, viewportHeight])

  const visibleLines = useMemo(
    () => lines.slice(startIndex, endIndex),
    [endIndex, lines, startIndex]
  )
  const visibleSideBySideRows = useMemo(
    () => sideBySideRows?.slice(startIndex, endIndex) ?? [],
    [endIndex, sideBySideRows, startIndex]
  )

  const highlightingDisabled =
    highlightLanguage === null &&
    language !== null &&
    lines.length > MAX_SYNTAX_HIGHLIGHT_LINES

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border/60 font-mono text-xs",
        className
      )}
    >
      <div
        ref={scrollContainerRef}
        onScroll={(event) => {
          const nextScrollTop = event.currentTarget.scrollTop
          if (rafRef.current) cancelAnimationFrame(rafRef.current)
          rafRef.current = requestAnimationFrame(() => {
            rafRef.current = 0
            setScrollTop(nextScrollTop)
          })
        }}
        style={maxHeight != null ? { maxHeight } : undefined}
        className={cn(
          mode === "side-by-side"
            ? "overflow-x-hidden overflow-y-auto"
            : "overflow-auto"
        )}
      >
        {topSpacerHeight > 0 && (
          <div style={{ height: `${topSpacerHeight}px` }} />
        )}

        {mode === "inline" ? (
          <div className="w-max min-w-full">
            {visibleLines.map((line, i) => {
              const absIdx = startIndex + i
              return (
                <DiffRow
                  key={absIdx}
                  line={line}
                  diffIndex={absIdx}
                  map={highlightMap}
                  themeStyle={themeStyle}
                  wordDiffRanges={
                    line.kind === "removed"
                      ? wordDiffMap.removed.get(absIdx)
                      : line.kind === "added"
                        ? wordDiffMap.added.get(absIdx)
                        : undefined
                  }
                />
              )
            })}
          </div>
        ) : (

          visibleSideBySideRows.length > 0 && (
            <SideBySideView
              rows={visibleSideBySideRows}
              map={highlightMap}
              themeStyle={themeStyle}
              wordDiffMap={wordDiffMap}
            />
          )
        )}

        {bottomSpacerHeight > 0 && (
          <div style={{ height: `${bottomSpacerHeight}px` }} />
        )}
      </div>

      {highlightingDisabled && (
        <div className="flex items-center border-t border-border/60 bg-muted/20 px-3 py-1 font-sans">
          <span className="ml-auto text-[10px] text-muted-foreground/50">
            Syntax highlighting disabled for large diff
          </span>
        </div>
      )}
    </div>
  )
}
