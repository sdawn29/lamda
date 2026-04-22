import { useState, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Loader2Icon, SparklesIcon } from "lucide-react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/ui/popover"
import { Button } from "@/shared/ui/button"
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

export function ContextChart({
  contextUsage,
  sessionId,
  sessionStats,
}: ContextChartProps) {
  const queryClient = useQueryClient()
  const [isCompacting, setIsCompacting] = useState(false)
  const [compactError, setCompactError] = useState<string | null>(null)
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

  const pctLabel = pct != null ? `${Math.round(pct)}%` : "?"
  const usedLabel = display.tokens != null ? formatTokens(display.tokens) : "?"
  const totalLabel = formatTokens(display.contextWindow)

  const tokens = sessionStats?.tokens
  const cost = sessionStats?.cost ?? null

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
      <PopoverContent side="top" align="end" className="w-56 p-0">
        <div className="px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">Context</span>
            <span
              className={`text-xs font-semibold tabular-nums ${
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
          <div className="mt-0.5 text-[10px] text-muted-foreground/60">
            {usedLabel} / {totalLabel}
          </div>
        </div>

        {sessionStats && tokens && (
          <div className="border-t border-border/50">
            {/* Tokens section */}
            <div className="px-3 py-1.5">
              <div className="mb-1 text-[9px] font-medium uppercase tracking-wide text-muted-foreground/60">
                Tokens
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px]">
                <span className="text-muted-foreground">Input</span>
                <span className="text-right tabular-nums font-medium">
                  {formatTokens(tokens.input)}
                </span>
                <span className="text-muted-foreground">Output</span>
                <span className="text-right tabular-nums font-medium">
                  {formatTokens(tokens.output)}
                </span>
                {tokens.cacheRead > 0 && (
                  <>
                    <span className="text-muted-foreground">Cache Reads</span>
                    <span className="text-right tabular-nums font-medium">
                      {formatTokens(tokens.cacheRead)}
                    </span>
                  </>
                )}
                {tokens.cacheWrite > 0 && (
                  <>
                    <span className="text-muted-foreground">Cache Writes</span>
                    <span className="text-right tabular-nums font-medium">
                      {formatTokens(tokens.cacheWrite)}
                    </span>
                  </>
                )}
                <span className="text-muted-foreground">Total</span>
                <span className="text-right tabular-nums font-semibold">
                  {formatTokens(tokens.total)}
                </span>
              </div>
            </div>

            {/* Messages section */}
            <div className="border-t border-border/50 px-3 py-1.5">
              <div className="mb-1 text-[9px] font-medium uppercase tracking-wide text-muted-foreground/60">
                Messages
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px]">
                <span className="text-muted-foreground">User</span>
                <span className="text-right tabular-nums font-medium">{sessionStats.userMessages}</span>
                <span className="text-muted-foreground">Assistant</span>
                <span className="text-right tabular-nums font-medium">{sessionStats.assistantMessages}</span>
                <span className="text-muted-foreground">Tools</span>
                <span className="text-right tabular-nums font-medium">{sessionStats.toolCalls}</span>
              </div>
            </div>
          </div>
        )}

        {cost != null && cost > 0 && (
          <div className="border-t border-border/50 px-3 py-1.5">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-muted-foreground">Estimated Cost</span>
              <span className="tabular-nums font-semibold">{formatCost(cost)}</span>
            </div>
          </div>
        )}

        {sessionId && (
          <div className="border-t border-border/50 px-3 py-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={handleCompact}
              disabled={isCompacting}
              className="w-full h-6 text-[10px]"
            >
              {isCompacting ? (
                <>
                  <Loader2Icon className="h-2.5 w-2.5 animate-spin mr-1" />
                  Compacting...
                </>
              ) : (
                <>
                  <SparklesIcon className="h-2.5 w-2.5 mr-1" />
                  Compact
                </>
              )}
            </Button>
          </div>
        )}

        {compactError && (
          <div className="px-3 pb-2">
            <p className="text-[9px] text-destructive">{compactError}</p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
