import { useMemo, useState } from "react"
import { eachDayOfInterval, format, startOfWeek, subWeeks } from "date-fns"
import {
  ChartColumn,
  CircleDollarSign,
  DatabaseZap,
  MessagesSquare,
} from "lucide-react"

import { useAiUsage } from "@/features/settings/queries"
import type { AiUsageDaily } from "@/features/settings/api"

// ── Formatting ────────────────────────────────────────────────────────────────

const compactFormat = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
})
const fullFormat = new Intl.NumberFormat("en-US")

function formatTokens(n: number): string {
  return n >= 10_000 ? compactFormat.format(n) : fullFormat.format(n)
}

function formatCost(n: number): string {
  if (n === 0) return "$0.00"
  if (n < 0.01) return `$${n.toFixed(4)}`
  return `$${n.toFixed(2)}`
}

const dayKey = (date: Date) => format(date, "yyyy-MM-dd")

// ── Activity heatmap geometry ─────────────────────────────────────────────────

const CELL = 10
const GAP = 3
const PITCH = CELL + GAP
/** Rolling window: the last 52 full weeks plus the current partial week. */
const WEEKS_BACK = 52

// Sequential ramp: one hue (the theme's primary), stepped from the card
// surface toward full primary via color-mix so it adapts to any theme and to
// light/dark automatically. Level 0 is the "no activity" neutral.
const LEVEL_COLORS = [
  "var(--muted)",
  "color-mix(in oklab, var(--primary) 30%, var(--card))",
  "color-mix(in oklab, var(--primary) 55%, var(--card))",
  "color-mix(in oklab, var(--primary) 78%, var(--card))",
  "var(--primary)",
]

interface HeatmapDay {
  key: string
  date: Date
  tokens: number
  cost: number
  /** 0 = no activity, 1–4 = quartile of nonzero daily token totals. */
  level: number
}

/** Weeks (Sunday-first columns) covering the window; future days are null. */
function buildWeeks(
  start: Date,
  today: Date,
  daily: AiUsageDaily[]
): HeatmapDay[][] {
  const byDay = new Map(daily.map((d) => [d.day, d]))
  const nonzero = daily
    .map((d) => d.totalTokens)
    .filter((t) => t > 0)
    .sort((a, b) => a - b)
  const quantile = (p: number) =>
    nonzero[Math.min(nonzero.length - 1, Math.floor(p * nonzero.length))]
  const [q1, q2, q3] =
    nonzero.length > 0
      ? [quantile(0.25), quantile(0.5), quantile(0.75)]
      : [0, 0, 0]

  const days = eachDayOfInterval({ start, end: today }).map((date) => {
    const key = dayKey(date)
    const row = byDay.get(key)
    const tokens = row?.totalTokens ?? 0
    const level =
      tokens === 0
        ? 0
        : tokens <= q1
          ? 1
          : tokens <= q2
            ? 2
            : tokens <= q3
              ? 3
              : 4
    return { key, date, tokens, cost: row?.cost ?? 0, level }
  })

  const weeks: HeatmapDay[][] = []
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7))
  }
  return weeks
}

/** Month labels for week columns, skipping a cramped label on the first column. */
function monthLabels(weeks: HeatmapDay[][]): { index: number; text: string }[] {
  const labels: { index: number; text: string }[] = []
  for (let i = 0; i < weeks.length; i++) {
    const month = weeks[i][0].date.getMonth()
    const prevMonth = i > 0 ? weeks[i - 1][0].date.getMonth() : null
    if (i === 0) {
      // Only label the first column when its month survives past the next
      // column — otherwise it would collide with that month's own label.
      if (weeks.length > 1 && weeks[1][0].date.getMonth() === month) {
        labels.push({ index: 0, text: format(weeks[0][0].date, "MMM") })
      }
    } else if (month !== prevMonth) {
      labels.push({ index: i, text: format(weeks[i][0].date, "MMM") })
    }
  }
  return labels
}

interface HoverState {
  day: HeatmapDay
  /** Viewport coords of the hovered cell's top-center, for a fixed tooltip. */
  x: number
  y: number
}

function ActivityHeatmap({ weeks }: { weeks: HeatmapDay[][] }) {
  const [hover, setHover] = useState<HoverState | null>(null)
  const labels = useMemo(() => monthLabels(weeks), [weeks])
  const gridWidth = weeks.length * PITCH - GAP

  return (
    <div className="overflow-x-auto" onMouseLeave={() => setHover(null)}>
      <div className="flex w-max gap-1.5 pr-1">
        {/* Weekday gutter */}
        <div
          className="relative shrink-0 select-none"
          style={{ width: 26, marginTop: 16 }}
        >
          {[1, 3, 5].map((row) => (
            <span
              key={row}
              className="absolute right-0 text-[9px] leading-none text-muted-foreground"
              style={{ top: row * PITCH + 1 }}
            >
              {["", "Mon", "", "Wed", "", "Fri", ""][row]}
            </span>
          ))}
        </div>

        <div>
          {/* Month labels */}
          <div
            className="relative h-4 select-none"
            style={{ width: gridWidth }}
          >
            {labels.map((label) => (
              <span
                key={`${label.text}-${label.index}`}
                className="absolute text-[9px] leading-none text-muted-foreground"
                style={{ left: label.index * PITCH, top: 2 }}
              >
                {label.text}
              </span>
            ))}
          </div>

          {/* Cells */}
          <div className="flex" style={{ gap: GAP }}>
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col" style={{ gap: GAP }}>
                {week.map((day) => (
                  <div
                    key={day.key}
                    className="rounded-xs"
                    style={{
                      width: CELL,
                      height: CELL,
                      backgroundColor: LEVEL_COLORS[day.level],
                    }}
                    onMouseEnter={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect()
                      setHover({
                        day,
                        x: rect.left + rect.width / 2,
                        y: rect.top,
                      })
                    }}
                  />
                ))}
                {/* Pad the current partial week so the column keeps its width. */}
                {week.length < 7 &&
                  Array.from({ length: 7 - week.length }).map((_, i) => (
                    <div
                      key={`pad-${i}`}
                      style={{ width: CELL, height: CELL }}
                    />
                  ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {hover && (
        <div
          className="pointer-events-none fixed z-50 -translate-x-1/2 rounded-md border border-border bg-popover px-2 py-1 text-[11px] whitespace-nowrap text-popover-foreground shadow-md"
          style={{ left: hover.x, top: hover.y - 30 }}
        >
          {hover.day.tokens > 0 ? (
            <>
              <span className="font-medium tabular-nums">
                {formatTokens(hover.day.tokens)} tokens
              </span>
              <span className="text-muted-foreground">
                {" "}
                · {formatCost(hover.day.cost)}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">No activity</span>
          )}
          <span className="text-muted-foreground">
            {" "}
            on {format(hover.day.date, "EEE, MMM d")}
          </span>
        </div>
      )}
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export function NewThreadDashboard() {
  // Day-key strings are stable within a day, so the query key and the memo
  // below only change at midnight.
  const todayKey = dayKey(new Date())
  const yearRange = useMemo(() => {
    const today = new Date(`${todayKey}T00:00:00`)
    return {
      from: dayKey(startOfWeek(subWeeks(today, WEEKS_BACK))),
      to: todayKey,
    }
  }, [todayKey])

  const year = useAiUsage(yearRange)
  const month = useAiUsage({ days: 30 })

  const weeks = useMemo(() => {
    if (!year.data) return []
    return buildWeeks(
      new Date(`${yearRange.from}T00:00:00`),
      new Date(`${yearRange.to}T00:00:00`),
      year.data.daily
    )
  }, [year.data, yearRange])

  if (year.isError || month.isError) return null
  if (year.isPending || month.isPending) {
    return (
      <div className="flex flex-col gap-3" aria-hidden>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-[86px] animate-pulse rounded-lg border border-border/60 bg-muted/30"
            />
          ))}
        </div>
        <div className="h-[170px] animate-pulse rounded-lg border border-border/60 bg-muted/30" />
      </div>
    )
  }
  // Keep the first-run hero clean: no usage recorded yet, no dashboard.
  if (year.data.totals.requests === 0) return null

  const totals = month.data.totals
  const promptTokens = totals.inputTokens + totals.cacheReadTokens
  const cacheHitRate =
    promptTokens > 0 ? (totals.cacheReadTokens / promptTokens) * 100 : 0
  const activeDays = month.data.daily.filter((d) => d.totalTokens > 0).length
  const yearActiveDays = year.data.daily.filter((d) => d.totalTokens > 0).length

  const cards = [
    {
      label: "Tokens",
      value: formatTokens(totals.totalTokens),
      detail:
        activeDays > 0
          ? `${formatTokens(totals.totalTokens / activeDays)} per active day`
          : "No activity yet",
      icon: ChartColumn,
    },
    {
      label: "Spend",
      value: formatCost(totals.cost),
      detail: "Based on provider list prices",
      icon: CircleDollarSign,
    },
    {
      label: "Requests",
      value: fullFormat.format(totals.requests),
      detail: `${activeDays} active ${activeDays === 1 ? "day" : "days"}`,
      icon: MessagesSquare,
    },
    {
      label: "Cache hit rate",
      value: `${cacheHitRate.toFixed(1)}%`,
      detail: "Prompt tokens served from cache",
      icon: DatabaseZap,
    },
  ]

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2 px-1 select-none">
        <span className="text-xs font-medium text-muted-foreground">
          Last 30 days
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="flex flex-col gap-1 rounded-lg border border-border/60 bg-card/50 p-3"
          >
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <card.icon className="size-3.5" />
              <span className="text-xs">{card.label}</span>
            </div>
            <span className="text-lg font-semibold tracking-tight tabular-nums">
              {card.value}
            </span>
            <span className="truncate text-[11px] text-muted-foreground">
              {card.detail}
            </span>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-border/60 bg-card/50 p-3">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 select-none">
          <span className="text-xs font-medium text-muted-foreground">
            Activity
          </span>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {formatTokens(year.data.totals.totalTokens)} tokens ·{" "}
            {formatCost(year.data.totals.cost)} · {yearActiveDays} active{" "}
            {yearActiveDays === 1 ? "day" : "days"} in the last year
          </span>
        </div>
        <ActivityHeatmap weeks={weeks} />
        <div className="mt-2 flex items-center justify-end gap-1 select-none">
          <span className="mr-0.5 text-[9px] text-muted-foreground">Less</span>
          {LEVEL_COLORS.map((color) => (
            <span
              key={color}
              className="rounded-xs"
              style={{ width: CELL, height: CELL, backgroundColor: color }}
            />
          ))}
          <span className="ml-0.5 text-[9px] text-muted-foreground">More</span>
        </div>
      </div>
    </div>
  )
}
