import { useState, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Loader2Icon, SparklesIcon } from "lucide-react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/ui/popover"
import { Button } from "@/shared/ui/button"
import type { ContextUsage, SessionStats } from "../api"
import { compactSession } from "../api"
import { chatKeys } from "../queries"
import { cn } from "@/shared/lib/utils"

interface ContextChartProps {
  contextUsage: ContextUsage | null | undefined
  sessionId?: string
  sessionStats?: SessionStats | null
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function formatCost(n: number): string {
  if (n >= 1) return `$${n.toFixed(2)}`
  if (n >= 0.01) return `$${n.toFixed(3)}`
  return `$${(n * 1000).toFixed(1)}m`
}

export function ContextChart({
  contextUsage,
  sessionId,
  sessionStats,
}: ContextChartProps) {
  const queryClient = useQueryClient()
  const [isCompacting, setIsCompacting] = useState(false)
  const lastValidRef = useRef<ContextUsage | null>(null)

  if (contextUsage && contextUsage.tokens != null) {
    lastValidRef.current = contextUsage
  }

  const display = lastValidRef.current ?? contextUsage
  if (!display) return null

  const pct =
    display.percent ??
    (display.tokens != null
      ? (display.tokens / display.contextWindow) * 100
      : null)

  // ── Ring trigger ─────────────────────────────────────────────────────────────
  const size = 16
  const strokeWidth = 2
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const fill = pct != null ? Math.min(pct, 100) / 100 : 0
  const dashOffset = circumference * (1 - fill)

  const ringColor =
    fill >= 0.9
      ? "stroke-destructive"
      : fill >= 0.75
        ? "stroke-yellow-500 dark:stroke-yellow-400"
        : "stroke-muted-foreground/40"

  const barColor =
    fill >= 0.9
      ? "bg-destructive"
      : fill >= 0.75
        ? "bg-yellow-500 dark:bg-yellow-400"
        : "bg-primary/60"

  const pctTextColor =
    fill >= 0.9
      ? "text-destructive"
      : fill >= 0.75
        ? "text-yellow-500 dark:text-yellow-400"
        : "text-foreground"

  const pctLabel = pct != null ? `${Math.round(pct)}%` : "?"
  const usedLabel = display.tokens != null ? formatTokens(display.tokens) : "?"
  const totalLabel = formatTokens(display.contextWindow)

  const tokens = sessionStats?.tokens
  const cost = sessionStats?.cost ?? null
  const hasCost = cost != null && cost > 0

  async function handleCompact() {
    if (!sessionId || isCompacting) return
    setIsCompacting(true)
    try {
      await compactSession(sessionId)
      void queryClient.invalidateQueries({ queryKey: chatKeys.contextUsage(sessionId) })
      void queryClient.invalidateQueries({ queryKey: chatKeys.sessionStats(sessionId) })
    } catch (err) {
      toast.error("Compaction failed", {
        description: err instanceof Error ? err.message : "Could not compact context. Please try again.",
      })
    } finally {
      setIsCompacting(false)
    }
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="group flex cursor-pointer items-center rounded px-0.5 py-0.5 transition-colors hover:bg-muted/60"
            aria-label="Context window usage"
          >
            <svg
              width={size}
              height={size}
              viewBox={`0 0 ${size} ${size}`}
              className="shrink-0 -rotate-90"
            >
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                strokeWidth={strokeWidth}
                className="stroke-muted-foreground/15"
              />
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                strokeWidth={strokeWidth}
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                strokeLinecap="round"
                className={`transition-all duration-500 ${ringColor}`}
              />
            </svg>
            {pct != null && (
              <span className="max-w-0 overflow-hidden text-[10px] leading-none text-muted-foreground tabular-nums transition-all duration-200 ease-out group-hover:max-w-[4ch] group-hover:pl-1">
                {Math.round(pct)}%
              </span>
            )}
          </button>
        }
      />

      <PopoverContent side="top" align="end" className="w-60 p-0 overflow-hidden">

        {/* Context window usage */}
        <div className="px-3.5 pt-3 pb-2.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-foreground/80">Context window</span>
            <span className={cn("text-xs font-semibold tabular-nums", pctTextColor)}>
              {pctLabel}
            </span>
          </div>
          {/* Progress bar */}
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full transition-all duration-500", barColor)}
              style={{ width: `${Math.min(fill * 100, 100)}%` }}
            />
          </div>
          <div className="mt-1.5 text-[10px] text-muted-foreground/60 tabular-nums">
            {usedLabel} of {totalLabel} tokens used
          </div>
        </div>

        {/* Token stats */}
        {tokens && (
          <div className="border-t border-border/50 px-3.5 py-2.5">
            <div className="space-y-1">
              <StatRow label="Input" value={formatTokens(tokens.input)} />
              <StatRow label="Output" value={formatTokens(tokens.output)} />
              {tokens.cacheRead > 0 && (
                <StatRow label="Cache read" value={formatTokens(tokens.cacheRead)} dimmed />
              )}
              {tokens.cacheWrite > 0 && (
                <StatRow label="Cache write" value={formatTokens(tokens.cacheWrite)} dimmed />
              )}
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-border/40 pt-2">
              <span className="text-[10px] font-medium text-muted-foreground">Total</span>
              <div className="flex items-center gap-3">
                {hasCost && (
                  <span className="text-[10px] tabular-nums text-muted-foreground/60">
                    {formatCost(cost)}
                  </span>
                )}
                <span className="text-[10px] font-semibold tabular-nums text-foreground">
                  {formatTokens(tokens.total)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Conversation stats */}
        {sessionStats && (
          <div className="border-t border-border/50 px-3.5 py-2">
            <div className="flex items-center gap-2.5 text-[10px] text-muted-foreground/60 tabular-nums">
              <span>{sessionStats.userMessages} user</span>
              <span className="opacity-40">·</span>
              <span>{sessionStats.assistantMessages} assistant</span>
              <span className="opacity-40">·</span>
              <span>{sessionStats.toolCalls} tools</span>
            </div>
          </div>
        )}

        {/* Compact button */}
        {sessionId && (
          <div className="border-t border-border/50 p-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={handleCompact}
              disabled={isCompacting}
              className="w-full h-7 gap-1.5 text-[11px] text-muted-foreground hover:text-foreground"
            >
              {isCompacting ? (
                <>
                  <Loader2Icon className="h-3 w-3 animate-spin" />
                  Compacting…
                </>
              ) : (
                <>
                  <SparklesIcon className="h-3 w-3" />
                  Compact context
                </>
              )}
            </Button>
          </div>
        )}

      </PopoverContent>
    </Popover>
  )
}

function StatRow({
  label,
  value,
  dimmed = false,
}: {
  label: string
  value: string
  dimmed?: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={cn("text-[10px]", dimmed ? "text-muted-foreground/50" : "text-muted-foreground")}>
        {label}
      </span>
      <span className={cn("text-[10px] tabular-nums font-medium", dimmed ? "text-muted-foreground/50" : "text-foreground/80")}>
        {value}
      </span>
    </div>
  )
}
