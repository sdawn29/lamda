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
  detail,
  detailClassName,
  className,
}: {
  icon?: ReactNode
  label: ReactNode
  meta?: ReactNode
  detail?: ReactNode
  detailClassName?: string
  className?: string
}) {
  const chip = (
    <span className="inline-flex align-middle">
      <Badge
        variant="outline"
        className={cn(
          "mx-0.5 rounded-md border-transparent bg-foreground/5! px-1.5 align-middle text-xs! text-foreground/80 transition-colors select-text hover:bg-foreground/10!",
          className
        )}
      >
        {icon}
        <span className="max-w-36 truncate">{label}</span>
        {meta && (
          <span className="font-mono text-3xs text-muted-foreground">
            {meta}
          </span>
        )}
      </Badge>
    </span>
  )

  if (!detail) return chip

  return (
    <TooltipProvider delay={250}>
      <Tooltip>
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
