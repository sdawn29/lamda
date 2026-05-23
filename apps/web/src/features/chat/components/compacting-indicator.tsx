import { cn } from "@/shared/lib/utils"

type CompactionReason = "manual" | "threshold" | "overflow"

const REASON_LABEL: Record<CompactionReason, string> = {
  manual: "Compacting context",
  threshold: "Compacting context",
  overflow: "Freeing context window",
}

interface CompactingIndicatorProps {
  className?: string
  reason?: CompactionReason | null
}

export function CompactingIndicator({ className, reason }: CompactingIndicatorProps) {
  const label = reason ? REASON_LABEL[reason] : REASON_LABEL.threshold

  return (
    <div
      className={cn(
        "flex w-full animate-in items-center gap-3 py-2 duration-200 fade-in-0",
        className
      )}
      aria-live="polite"
      aria-label={label}
    >
      <div className="h-px flex-1 bg-border/60" />
      <div className="flex shrink-0 items-center text-xs text-muted-foreground/60">
        <span className="animate-thinking-shimmer bg-linear-to-r from-muted-foreground/40 via-foreground/70 to-muted-foreground/40 bg-size-[200%_100%] bg-clip-text text-transparent">
          {label}
        </span>
      </div>
      <div className="h-px flex-1 bg-border/60" />
    </div>
  )
}
