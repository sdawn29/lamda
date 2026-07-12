import type { ReactNode } from "react"
import { Badge } from "@/shared/ui/badge"
import { cn } from "@/shared/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/shared/ui/tooltip"

export function MessageChip({
  icon,
  label,
  meta,
  statusDot,
  detail,
  detailClassName,
  className,
  onClick,
  onOpenChange,
}: {
  icon?: ReactNode
  label: ReactNode
  meta?: ReactNode
  /** Small status affordance rendered after the label — e.g. the colored
   *  git-status letter on file chips. */
  statusDot?: ReactNode
  detail?: ReactNode
  detailClassName?: string
  className?: string
  /** When set, the chip becomes an interactive button. */
  onClick?: () => void
  /** Forwarded to the underlying Tooltip — fires when it opens/closes. */
  onOpenChange?: (open: boolean) => void
}) {
  const badge = (
    <Badge
      variant="outline"
      className={cn(
        // Mirror the composer's CHIP_CLASS (rich-input.tsx) so a chip looks
        // the same after sending as it did while typing.
        "mx-0.5 rounded-md border-transparent bg-foreground/5 px-1.5 align-middle text-xs! text-foreground/80 transition-colors select-text hover:bg-foreground/10 [&>svg]:size-3.5!",
        onClick &&
          "cursor-pointer select-none hover:bg-primary/10! hover:text-foreground",
        className
      )}
    >
      {icon}
      <span>{label}</span>
      {statusDot}
      {meta && (
        <span className="font-mono text-3xs text-muted-foreground">{meta}</span>
      )}
    </Badge>
  )

  const chip = onClick ? (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex align-middle focus-visible:outline-none"
    >
      {badge}
    </button>
  ) : (
    <span className="inline-flex align-middle">{badge}</span>
  )

  if (!detail) return chip

  return (
    <TooltipProvider delay={250}>
      <Tooltip onOpenChange={onOpenChange}>
        <TooltipTrigger render={chip} />
        <TooltipContent
          side="top"
          align="start"
          sideOffset={8}
          className={detailClassName}
        >
          {detail}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
