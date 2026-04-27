import { useMemo } from "react"
import { type LucideIcon } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip"
import { cn } from "@/shared/lib/utils"

interface IconButtonWithTooltipProps {
  /** The icon component to render */
  icon: LucideIcon
  /** Tooltip label shown on hover */
  label: string
  /** Click handler */
  onClick: (e: React.MouseEvent) => void
  /** Visual style variant */
  variant?: "default" | "destructive" | "ghost"
  /** Button size variant */
  size?: "icon-sm" | "icon-xs" | "icon"
  /** Disabled state */
  disabled?: boolean
  className?: string
}

export function IconButtonWithTooltip({
  icon: Icon,
  label,
  onClick,
  variant = "ghost",
  size = "icon-sm",
  disabled,
  className,
}: IconButtonWithTooltipProps) {
  // Memoize the render function to prevent base-ui tooltip infinite loops
  const button = useMemo(
    () => (
      <Button
        variant={variant}
        size={size}
        className={cn(
          variant === "destructive" &&
            "text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive",
          className
        )}
        disabled={disabled}
        onClick={onClick}
      >
        <Icon className="h-3 w-3" />
        <span className="sr-only">{label}</span>
      </Button>
    ),
    [Icon, variant, size, disabled, onClick, className, label]
  )

  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
