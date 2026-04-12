import { useMemo } from "react"
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
  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches)
  const themeStyle = (isDark ? jellybeansdark : jellybeanslight) as ThemeStyle

  const lines = useMemo(() => parseDiff(diff), [diff])

  const language = useMemo(
    () => (filePath ? detectLanguage(filePath) : null),
    [filePath]
  )

  const highlightMap = useMemo(
    () => buildHighlightMap(lines, language),
    [lines, language]
  )

  const sideBySideRows = useMemo(() => {
    if (mode !== "side-by-side") return null
    return buildSideBySideRows(lines)
  }, [lines, mode])

  const added = lines.filter((l) => l.kind === "added").length
  const removed = lines.filter((l) => l.kind === "removed").length

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border/60 font-mono text-xs",
        className
      )}
    >
      <div
        className={cn(
          "max-h-80",
          mode === "side-by-side"
            ? "overflow-x-hidden overflow-y-auto"
            : "overflow-auto"
        )}
      >
        {mode === "inline"
          ? lines.map((line, i) => (
              <DiffRow
                key={i}
                line={line}
                diffIndex={i}
                map={highlightMap}
                themeStyle={themeStyle}
              />
            ))
          : sideBySideRows && (
              <SideBySideView
                rows={sideBySideRows}
                map={highlightMap}
                themeStyle={themeStyle}
              />
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
        </div>
      )}
    </div>
  )
}
