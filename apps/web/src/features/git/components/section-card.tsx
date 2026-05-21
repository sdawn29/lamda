import { memo, useState, type ReactNode } from "react"
import { ChevronRight, Loader2 } from "lucide-react"
import { Badge } from "@/shared/ui/badge"
import { cn } from "@/shared/lib/utils"

interface SectionCardProps {
  label: string
  count?: number
  isLoading?: boolean
  children?: ReactNode
  className?: string
}

export const SectionCard = memo(function SectionCard({
  label,
  count,
  isLoading,
  children,
  className,
}: SectionCardProps) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div
      className={cn(
        "mx-2 mt-2 overflow-hidden rounded-md border border-border/60 bg-background/70 shadow-sm",
        className
      )}
    >
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="flex h-8 w-full items-center gap-2 border-b border-border/35 bg-muted/25 px-2.5 text-left transition-colors hover:bg-muted/40"
      >
        <ChevronRight
          className={cn(
            "size-3 shrink-0 text-muted-foreground/45 transition-transform duration-150",
            !collapsed && "rotate-90"
          )}
        />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
          {label}
        </span>
        {isLoading && (
          <Loader2 className="size-3 animate-spin text-muted-foreground/40" />
        )}
        {!isLoading && count != null && count > 0 && (
          <Badge
            variant="secondary"
            className="h-4 min-w-4 rounded-sm px-1 text-[10px] tabular-nums"
          >
            {count}
          </Badge>
        )}
      </button>

      {!collapsed && (
        <div className="animate-in duration-150 fade-in-0 slide-in-from-top-1">
          {children}
        </div>
      )}
    </div>
  )
})
