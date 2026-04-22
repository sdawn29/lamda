import { useState, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Loader2Icon, SparklesIcon } from "lucide-react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/ui/popover"
import { Button } from "@/shared/ui/button"
import { Separator } from "@/shared/ui/separator"
import type { ContextUsage } from "../api"
import type { SessionStats } from "../api"
import { compactSession } from "../api"
import { chatKeys } from "../queries"

interface ContextChartProps {
  contextUsage: ContextUsage | null | undefined
  sessionId?: string
  sessionStats?: SessionStats | null
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

function formatCost(n: number): string {
  if (n >= 1) return `$${n.toFixed(2)}`
  if (n >= 0.01) return `$${n.toFixed(3)}`
  return `$${(n * 1000).toFixed(1)}m`
}

function StatRow({
  label,
  value,
  subvalue,
  highlight = false,
}: {
  label: string
  value: string | number
  subvalue?: string
  highlight?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span
        className={`text-[11px] tabular-nums font-medium ${
          highlight ? "text-foreground" : "text-foreground/80"
        }`}
      >
        {value}
        {subvalue && (
          <span className="ml-1 text-[10px] text-muted-foreground/60">
            {subvalue}
          </span>
        )}
      </span>
    </div>
  )
}

function TokenBar({
  value,
  max,
  colorClass,
}: {
  value: number
  max: number
  colorClass: string
}) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={`h-full rounded-full transition-all duration-300 ${colorClass}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export function ContextChart({
  contextUsage,
  sessionId,
  sessionStats,
}: ContextChartProps) {
  const queryClient = useQueryClient()
  const [isCompacting, setIsCompacting] = useState(false)
  const [compactError, setCompactError] = useState<string | null>(null)
  // Hold the last valid (non-null-tokens) snapshot so we never flash "?"
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

  const barColorClass =
    fill >= 0.9
      ? "bg-destructive"
      : fill >= 0.75
        ? "bg-yellow-500 dark:bg-yellow-400"
        : "bg-primary"

  const pctLabel = pct != null ? `${Math.round(pct)}%` : "?"
  const usedLabel = display.tokens != null ? formatTokens(display.tokens) : "?"
  const totalLabel = formatTokens(display.contextWindow)

  async function handleCompact() {
    if (!sessionId || isCompacting) return
    setIsCompacting(true)
    setCompactError(null)
    try {
      await compactSession(sessionId)
      void queryClient.invalidateQueries({
        queryKey: chatKeys.contextUsage(sessionId),
      })
      void queryClient.invalidateQueries({
        queryKey: chatKeys.sessionStats(sessionId),
      })
    } catch (err) {
      setCompactError(err instanceof Error ? err.message : "Compaction failed")
    } finally {
      setIsCompacting(false)
    }
  }

  // Get token stats from session stats
  const hasTokens = sessionStats && sessionStats.tokens
  const tokens = sessionStats?.tokens
  const cost = sessionStats?.cost ?? null
  const messages = sessionStats
    ? {
        user: sessionStats.userMessages,
        assistant: sessionStats.assistantMessages,
        toolCalls: sessionStats.toolCalls,
      }
    : null

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
              <span className="max-w-0 overflow-hidden text-[10px] leading-none text-muted-foreground tabular-nums transition-all duration-200 ease-out group-hover:max-w-[3ch] group-hover:pl-1">
                {Math.round(pct)}%
              </span>
            )}
          </button>
        }
      />
      <PopoverContent side="top" align="end" className="w-64 p-3">
        {/* Header with context window */}
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-xs font-medium text-popover-foreground">
            Context
          </span>
          <div className="flex items-center gap-2">
            <span
              className={`text-sm font-semibold tabular-nums ${
                fill >= 0.9
                  ? "text-destructive"
                  : fill >= 0.75
                    ? "text-yellow-500 dark:text-yellow-400"
                    : "text-foreground"
              }`}
            >
              {pctLabel}
            </span>
          </div>
        </div>

        {/* Context window bar */}
        <div className="mb-3">
          <TokenBar value={fill} max={100} colorClass={barColorClass} />
          <div className="mt-1 flex justify-between">
            <span className="text-[10px] text-muted-foreground">
              {usedLabel} used
            </span>
            <span className="text-[10px] text-muted-foreground">
              {totalLabel} window
            </span>
          </div>
        </div>

        {/* Token breakdown from session stats */}
        {tokens && (
          <>
            <Separator className="my-2" />
            <div className="space-y-1.5">
              <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60 mb-1">
                Tokens
              </div>
              <StatRow
                label="Input"
                value={formatTokens(tokens.input)}
              />
              <StatRow
                label="Output"
                value={formatTokens(tokens.output)}
              />
              {tokens.cacheRead > 0 && (
                <StatRow
                  label="Cache reads"
                  value={formatTokens(tokens.cacheRead)}
                />
              )}
              {tokens.cacheWrite > 0 && (
                <StatRow
                  label="Cache writes"
                  value={formatTokens(tokens.cacheWrite)}
                />
              )}
              <StatRow
                label="Total"
                value={formatTokens(tokens.total)}
                highlight
              />
            </div>
          </>
        )}

        {/* Message counts */}
        {messages && (
          <>
            <Separator className="my-2" />
            <div className="space-y-1.5">
              <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60 mb-1">
                Messages
              </div>
              <StatRow
                label="User"
                value={messages.user}
              />
              <StatRow
                label="Assistant"
                value={messages.assistant}
              />
              <StatRow
                label="Tool calls"
                value={messages.toolCalls}
              />
            </div>
          </>
        )}

        {/* Cost */}
        {cost != null && cost > 0 && (
          <>
            <Separator className="my-2" />
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">Est. cost</span>
              <span className="text-[11px] font-medium text-foreground/80">
                {formatCost(cost)}
              </span>
            </div>
          </>
        )}

        {/* Compact button */}
        {sessionId && (
          <>
            <Separator className="my-2" />
            <Button
              size="sm"
              variant="secondary"
              onClick={handleCompact}
              disabled={isCompacting}
              className="w-full h-7 text-[11px]"
            >
              {isCompacting ? (
                <>
                  <Loader2Icon className="h-3 w-3 animate-spin mr-1.5" />
                  Compacting...
                </>
              ) : (
                <>
                  <SparklesIcon className="h-3 w-3 mr-1.5" />
                  Compact context
                </>
              )}
            </Button>
          </>
        )}

        {compactError && (
          <p className="mt-2 text-[10px] text-destructive">{compactError}</p>
        )}
      </PopoverContent>
    </Popover>
  )
}
