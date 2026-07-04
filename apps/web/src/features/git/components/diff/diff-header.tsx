import { memo } from "react"
import { Icon } from "@iconify/react"
import { getIconName } from "@/shared/ui/file-icon"
import { DiffStat } from "../diff-stat"
import { DiffModeToggle } from "../diff-mode-toggle"
import type { DiffMode } from "./types"

interface DiffHeaderProps {
  filePath?: string
  added: number
  removed: number
  mode: DiffMode
  onModeChange: (mode: DiffMode) => void
}

/**
 * Toolbar shown above the Monaco diff: file identity on the left, change
 * stats and an inline/side-by-side view toggle on the right. Styled to match
 * the app's other panel headers (muted surface, hairline border, mono path).
 */
export const DiffHeader = memo(function DiffHeader({
  filePath,
  added,
  removed,
  mode,
  onModeChange,
}: DiffHeaderProps) {
  const parts = filePath ? filePath.split("/") : []
  const fileName = parts.length > 0 ? (parts[parts.length - 1] ?? "") : ""
  const dirPath = parts.length > 1 ? parts.slice(0, -1).join("/") + "/" : null

  return (
    <div className="flex h-8 items-center gap-2 border-b border-border/50 bg-muted/30 pr-1 pl-2.5">
      {fileName && (
        <Icon
          icon={`catppuccin:${getIconName(fileName)}`}
          className="size-3.5 shrink-0"
          aria-hidden
        />
      )}
      <span className="flex min-w-0 flex-1 items-baseline gap-1.5 overflow-hidden">
        {fileName && (
          <span className="shrink-0 truncate font-mono text-2xs font-medium text-foreground/85">
            {fileName}
          </span>
        )}
        {dirPath && (
          <span className="truncate font-mono text-3xs text-muted-foreground/40">
            {dirPath}
          </span>
        )}
      </span>

      <DiffStat added={added} removed={removed} />

      <DiffModeToggle
        mode={mode}
        onModeChange={onModeChange}
        className="ml-1"
      />
    </div>
  )
})
