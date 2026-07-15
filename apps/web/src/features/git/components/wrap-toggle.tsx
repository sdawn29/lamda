import { WrapText } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip"
import { cn } from "@/shared/lib/utils"

interface WrapToggleProps {
  wrap: boolean
  onWrapChange: (wrap: boolean) => void
  disabled?: boolean
  /** Tooltip shown instead of the wrap/unwrap label while disabled. */
  disabledReason?: string
  className?: string
}

export function WrapToggle({
  wrap,
  onWrapChange,
  disabled = false,
  disabledReason,
  className,
}: WrapToggleProps) {
  const label = wrap ? "Unwrap lines" : "Wrap lines"
  const tooltip = disabled ? (disabledReason ?? label) : label

  const button = (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      disabled={disabled}
      onClick={() => onWrapChange(!wrap)}
      aria-label={label}
      aria-pressed={wrap}
      className={cn(
        "relative border-border/60 bg-muted/30 text-muted-foreground/75 hover:bg-muted hover:text-foreground aria-pressed:bg-muted aria-pressed:text-foreground",
        className
      )}
    >
      <WrapText className="size-3.5" aria-hidden />
      <span className="sr-only">{label}</span>
    </Button>
  )

  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  )
}
