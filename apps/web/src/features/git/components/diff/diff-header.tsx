import { memo } from "react"
import { AlignLeft, Columns2 } from "lucide-react"
import { Icon } from "@iconify/react"
import { getIconName } from "@/shared/ui/file-icon"
import { Button } from "@/shared/ui/button"
import { cn } from "@/shared/lib/utils"
import { DiffStat } from "../diff-stat"
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
    <div className="flex h-8 items-center gap-2 border-b border-border/60 bg-muted/30 pr-1 pl-2.5">
      {fileName && (
        <Icon
          icon={`catppuccin:${getIconName(fileName)}`}
          className="size-3.5 shrink-0"
          aria-hidden
        />
      )}
      <span className="flex min-w-0 flex-1 items-baseline gap-1.5 overflow-hidden">
        {fileName && (
          <span className="shrink-0 truncate font-mono text-[11px] font-medium text-foreground/85">
            {fileName}
          </span>
        )}
        {dirPath && (
          <span className="truncate font-mono text-[10px] text-muted-foreground/40">
            {dirPath}
          </span>
        )}
      </span>

      <DiffStat added={added} removed={removed} />

      <div className="ml-1 inline-flex h-6 items-center rounded-md border border-border/70 bg-background/60 p-0.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onModeChange("inline")}
          data-active={mode === "inline"}
          className={modeButtonClass}
          aria-label="Inline view"
          aria-pressed={mode === "inline"}
        >
          <AlignLeft className="size-3" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onModeChange("side-by-side")}
          data-active={mode === "side-by-side"}
          className={modeButtonClass}
          aria-label="Side-by-side view"
          aria-pressed={mode === "side-by-side"}
        >
          <Columns2 className="size-3" />
        </Button>
      </div>
    </div>
  )
})

const modeButtonClass = cn(
  "h-5 rounded-sm px-1.5 text-muted-foreground/70 hover:text-foreground",
  "data-[active=true]:bg-card data-[active=true]:text-foreground data-[active=true]:shadow-xs"
)
