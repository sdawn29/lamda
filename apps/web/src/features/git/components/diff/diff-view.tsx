import { useEffect, useMemo, useRef, useState } from "react"
import { cn } from "@/shared/lib/utils"
import { jellybeansdark, jellybeanslight } from "@/shared/lib/syntax-theme"
import { useTheme } from "@/shared/components/theme-provider"
import type { DiffMode, ThemeStyle } from "./types"
import { buildHighlightMap, detectLanguage } from "./highlight"
import { parseDiff } from "./parser"
import { DiffRow } from "./diff-row"
import { buildSideBySideRows, SideBySideView } from "./side-by-side"

export type { DiffMode }
export { detectLanguage }

const DIFF_ROW_HEIGHT_PX = 20
const DIFF_OVERSCAN_ROWS = 40
const MAX_SYNTAX_HIGHLIGHT_LINES = 1200

interface DiffViewProps {
  diff: string
  filePath?: string
  className?: string
  mode?: DiffMode
}

export function DiffView({
  diff,
  filePath,
  className,
  mode = "inline",
}: DiffViewProps) {
  const { theme } = useTheme()
  const scrollContainerRef = useRef<HTMLDivElement>(null)
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

  const language = useMemo(
    () => (filePath ? detectLanguage(filePath) : null),
    [filePath]
  )
  const highlightLanguage = useMemo(
    () => (lines.length > MAX_SYNTAX_HIGHLIGHT_LINES ? null : language),
    [language, lines.length]
  )

  const highlightMap = useMemo(
    () => buildHighlightMap(lines, highlightLanguage),
    [highlightLanguage, lines]
  )

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

  const added = lines.filter((l) => l.kind === "added").length
  const removed = lines.filter((l) => l.kind === "removed").length
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
          setScrollTop((current) =>
            current === nextScrollTop ? current : nextScrollTop
          )
        }}
        className={cn(
          "max-h-80",
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
            {visibleLines.map((line, i) => (
              <DiffRow
                key={startIndex + i}
                line={line}
                diffIndex={startIndex + i}
                map={highlightMap}
                themeStyle={themeStyle}
              />
            ))}
          </div>
        ) : (
          visibleSideBySideRows.length > 0 && (
            <SideBySideView
              rows={visibleSideBySideRows}
              map={highlightMap}
              themeStyle={themeStyle}
            />
          )
        )}

        {bottomSpacerHeight > 0 && (
          <div style={{ height: `${bottomSpacerHeight}px` }} />
        )}
      </div>

      {(added > 0 || removed > 0) && (
        <div className="flex items-center gap-3 border-t border-border/60 bg-muted/20 px-3 py-1.5 font-sans text-xs text-muted-foreground">
          {removed > 0 && (
            <span className="text-red-500">−{removed} removed</span>
          )}
          {added > 0 && (
            <span className="text-green-600 dark:text-green-400">
              +{added} added
            </span>
          )}
          {highlightingDisabled && (
            <span className="ml-auto text-[10px] text-muted-foreground/80">
              Syntax highlighting disabled for large diff
            </span>
          )}
        </div>
      )}
    </div>
  )
}
