import { Button } from "@/shared/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip"
import { cn } from "@/shared/lib/utils"
import type { DiffMode } from "./diff-view"

interface DiffModeToggleProps {
  mode: DiffMode
  onModeChange: (mode: DiffMode) => void
  className?: string
}

const MODE_LABEL: Record<DiffMode, string> = {
  inline: "same-line",
  "side-by-side": "side-by-side",
}

function nextMode(mode: DiffMode): DiffMode {
  return mode === "inline" ? "side-by-side" : "inline"
}

export function DiffModeToggle({
  mode,
  onModeChange,
  className,
}: DiffModeToggleProps) {
  const next = nextMode(mode)
  const label = `Switch to ${MODE_LABEL[next]} diff view`

  const button = (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={() => onModeChange(next)}
      aria-label={label}
      className={cn(
        "relative border-border/60 bg-muted/30 text-muted-foreground/75 hover:bg-muted hover:text-foreground",
        className
      )}
    >
      <DiffModeGlyph mode={mode} />
      <span className="sr-only">{label}</span>
    </Button>
  )

  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function DiffModeGlyph({ mode }: { mode: DiffMode }) {
  if (mode === "side-by-side") {
    return (
      <span
        aria-hidden
        className="grid size-3.5 grid-cols-2 gap-px overflow-hidden rounded-[2px]"
      >
        <span className="rounded-[1px] bg-diff-remove/75" />
        <span className="rounded-[1px] bg-diff-add/75" />
      </span>
    )
  }

  return (
    <span
      aria-hidden
      className="grid size-3.5 grid-rows-2 gap-px overflow-hidden rounded-[2px]"
    >
      <span className="rounded-[1px] bg-diff-remove/75" />
      <span className="rounded-[1px] bg-diff-add/75" />
    </span>
  )
}
