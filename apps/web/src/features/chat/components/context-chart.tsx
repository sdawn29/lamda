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
import { SectionLabel } from "@/shared/ui/section-label"
import type { ContextBreakdown, ContextUsage, SessionStats } from "../api"
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

// Ordered segments that make up the current context window. Each maps to a
// field on ContextBreakdown and shares one color between bar and legend.
const CONTEXT_SEGMENTS = [
  { key: "cacheRead", label: "Cached", color: "bg-sky-500 dark:bg-sky-400" },
  { key: "input", label: "Input", color: "bg-violet-500 dark:bg-violet-400" },
  { key: "output", label: "Output", color: "bg-emerald-500 dark:bg-emerald-400" },
  { key: "cacheWrite", label: "Cache write", color: "bg-indigo-500 dark:bg-indigo-400" },
  { key: "pending", label: "Pending", color: "bg-amber-500 dark:bg-amber-400" },
] as const satisfies ReadonlyArray<{
  key: keyof ContextBreakdown
  label: string
  color: string
}>

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

  // Status pill — a quick read on how much headroom remains.
  const status =
    fill >= 0.9
      ? { label: "Nearly full", pill: "bg-destructive/10 text-destructive" }
      : fill >= 0.75
        ? {
            label: "Filling up",
            pill: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
          }
        : {
            label: "Healthy",
            pill: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
          }

  const usedLabel = display.tokens != null ? formatTokens(display.tokens) : "?"
  const totalLabel = formatTokens(display.contextWindow)

  const tokens = sessionStats?.tokens
  const cost = sessionStats?.cost ?? null
  const hasCost = cost != null && cost > 0

  // Stacked segments of the current context window (real per-request usage).
  const breakdown = display.breakdown
  const segments = breakdown
    ? CONTEXT_SEGMENTS.map((s) => ({ ...s, value: breakdown[s.key] })).filter(
        (s) => s.value > 0,
      )
    : []
  const hasSegments = segments.length > 0

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
              <span className="max-w-0 overflow-hidden text-3xs leading-none text-muted-foreground tabular-nums transition-all duration-200 ease-out group-hover:max-w-[4ch] group-hover:pl-1">
                {Math.round(pct)}%
              </span>
            )}
          </button>
        }
      />

      <PopoverContent side="top" align="end" className="w-64 p-0 overflow-hidden">

        {/* ── Context window (hero) ─────────────────────────────────────── */}
        <div className="px-3.5 pt-3.5 pb-3">
          <div className="flex items-center justify-between">
            <SectionLabel>Context window</SectionLabel>
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-3xs font-medium leading-none",
                status.pill,
              )}
            >
              {status.label}
            </span>
          </div>

          <div className="mt-2.5 flex items-end justify-between">
            <div className="flex items-baseline gap-0.5">
              <span
                className={cn(
                  "text-[2rem] font-semibold leading-none tracking-tight tabular-nums",
                  pctTextColor,
                )}
              >
                {pct != null ? Math.round(pct) : "—"}
              </span>
              <span
                className={cn("text-base font-medium opacity-50", pctTextColor)}
              >
                %
              </span>
            </div>
            {display.tokens != null && (
              <div className="flex flex-col items-end leading-none">
                <span className="text-2xs font-medium tabular-nums text-foreground/80">
                  {usedLabel}
                </span>
                <span className="mt-0.5 text-3xs tabular-nums text-muted-foreground/60">
                  of {totalLabel}
                </span>
              </div>
            )}
          </div>

          {/* Stacked usage bar */}
          <div className="mt-3 flex h-2 w-full gap-px overflow-hidden rounded-full bg-muted">
            {hasSegments ? (
              segments.map((s) => (
                <div
                  key={s.key}
                  className={cn(
                    "h-full rounded-full transition-all duration-500 first:rounded-l-full last:rounded-r-full",
                    s.color,
                  )}
                  style={{ width: `${(s.value / display.contextWindow) * 100}%` }}
                  title={`${s.label}: ${formatTokens(s.value)}`}
                />
              ))
            ) : (
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  barColor,
                )}
                style={{ width: `${Math.min(fill * 100, 100)}%` }}
              />
            )}
          </div>

          {/* Legend */}
          {hasSegments && (
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
              {segments.map((s) => (
                <div key={s.key} className="flex items-center gap-1.5">
                  <span className={cn("size-1.5 shrink-0 rounded-full", s.color)} />
                  <span className="text-3xs text-muted-foreground">{s.label}</span>
                  <span className="ml-auto text-3xs font-medium tabular-nums text-foreground/80">
                    {formatTokens(s.value)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Session totals ────────────────────────────────────────────── */}
        {(tokens || sessionStats) && (
          <div className="space-y-2 border-t border-border/50 bg-muted/30 px-3.5 py-2.5">
            {tokens && (
              <div className="flex items-center justify-between">
                <SectionLabel>Session total</SectionLabel>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xs font-semibold tabular-nums text-foreground">
                    {formatTokens(tokens.total)}
                  </span>
                  {hasCost && (
                    <span className="text-3xs tabular-nums text-muted-foreground/60">
                      {formatCost(cost)}
                    </span>
                  )}
                </div>
              </div>
            )}
            {sessionStats && (
              <div className="grid grid-cols-3 gap-1">
                {[
                  { label: "User", value: sessionStats.userMessages },
                  { label: "Assistant", value: sessionStats.assistantMessages },
                  { label: "Tools", value: sessionStats.toolCalls },
                ].map((stat) => (
                  <div key={stat.label} className="flex flex-col items-center gap-0.5 rounded-md bg-background/60 py-1.5">
                    <span className="text-2xs font-semibold tabular-nums text-foreground/90">
                      {stat.value}
                    </span>
                    <span className="text-3xs text-muted-foreground/60">
                      {stat.label}
                    </span>
                  </div>
                ))}
              </div>
            )}
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
              className="w-full h-7 gap-1.5 text-2xs text-muted-foreground hover:text-foreground"
            >
              {isCompacting ? (
                <>
                  <Loader2Icon className="h-3 w-3 animate-spin" />
                  Compacting
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
