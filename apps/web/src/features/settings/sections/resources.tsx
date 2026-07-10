import { useMemo, type ReactNode } from "react"
import {
  ActivityIcon,
  AlertCircleIcon,
  CheckCircle2Icon,
  CpuIcon,
  DatabaseIcon,
  Loader2Icon,
  MemoryStickIcon,
  ServerIcon,
} from "lucide-react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts"

import { SettingsGroup, SettingsRow } from "../components/settings-ui"
import { useResourceSnapshot } from "../queries"
import { Progress } from "@/shared/ui/progress"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/shared/ui/chart"
import { cn } from "@/shared/lib/utils"
import type {
  BackgroundQueueStats,
  ResourceSnapshot,
  ResourceStorageStats,
} from "../api"

const SPARKLINE_POINTS = 30

// ── Formatting ────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  )
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "warming up"
  }
  return `${Math.round(value)}%`
}

function formatMs(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "warming up"
  }
  return value >= 100 ? `${Math.round(value)} ms` : `${value.toFixed(1)} ms`
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "unknown"
  const days = Math.floor(seconds / 86_400)
  const hours = Math.floor((seconds % 86_400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  })
}

// ── Building blocks ───────────────────────────────────────────────────────────

/**
 * Tiny inline trend line for stat tiles: the series in a recessive gray with
 * the newest value marked by an accent dot.
 */
function Sparkline({ points }: { points: (number | null)[] }) {
  const values = points.filter(
    (value): value is number => value !== null && Number.isFinite(value)
  )
  if (values.length < 2) return null

  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min
  const normalize = (value: number) =>
    range > 0 ? 1 - (value - min) / range : 0.5

  const step = 100 / (values.length - 1)
  const coords = values.map(
    (value, index) => [index * step, 4 + normalize(value) * 24] as const
  )
  const last = coords[coords.length - 1]

  return (
    <div className="relative h-8 w-20 min-w-8 shrink" aria-hidden>
      <svg
        viewBox="0 0 100 32"
        preserveAspectRatio="none"
        className="size-full overflow-visible"
      >
        <polyline
          points={coords.map(([x, y]) => `${x},${y}`).join(" ")}
          fill="none"
          stroke="var(--muted-foreground)"
          strokeOpacity={0.45}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span
        className="absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-card"
        style={{ left: "100%", top: `${(last[1] / 32) * 100}%` }}
      />
    </div>
  )
}

function StatTile({
  label,
  value,
  detail,
  points,
}: {
  label: string
  value: string
  detail: string
  points?: (number | null)[]
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-border/60 bg-card/50 p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center justify-between gap-2">
        <span className="whitespace-nowrap text-xl font-semibold leading-tight">
          {value}
        </span>
        {points && <Sparkline points={points} />}
      </div>
      <span className="text-xs text-muted-foreground">{detail}</span>
    </div>
  )
}

function Meter({
  icon,
  label,
  value,
  detail,
  percent,
}: {
  icon: ReactNode
  label: string
  value: string
  detail: string
  percent: number | null | undefined
}) {
  const normalized =
    percent === null || percent === undefined || !Number.isFinite(percent)
      ? 0
      : Math.max(0, Math.min(100, percent))

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-card/50 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground [&_svg]:size-4">
            {icon}
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="text-sm font-medium">{label}</span>
            <span className="truncate text-xs text-muted-foreground">
              {detail}
            </span>
          </div>
        </div>
        <span className="shrink-0 text-sm font-medium tabular-nums">
          {value}
        </span>
      </div>
      <Progress value={normalized} className="h-1.5" />
    </div>
  )
}

function ChartPanel({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-lg border border-border/60 bg-card/50 p-3">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  )
}

// ── Charts ────────────────────────────────────────────────────────────────────
// Every multi-series chart pairs copper (app — the subject) with slate
// (system/context): the strongest CVD-separated pair in the theme palette.
// Identity never rests on color alone — each chart carries a legend and a
// shared crosshair tooltip.

const cpuChartConfig = {
  appCpu: { label: "App server", color: "var(--chart-1)" },
  systemCpu: { label: "This computer", color: "var(--chart-3)" },
} satisfies ChartConfig

const memoryChartConfig = {
  rss: { label: "Process total (RSS)", color: "var(--chart-1)" },
  heapUsed: { label: "JS heap used", color: "var(--chart-3)" },
} satisfies ChartConfig

const loopChartConfig = {
  loopDelayMs: { label: "Mean delay", color: "var(--chart-1)" },
} satisfies ChartConfig

const workChartConfig = {
  activeLanes: { label: "Running lanes", color: "var(--chart-1)" },
  queuedJobs: { label: "Queued jobs", color: "var(--chart-3)" },
} satisfies ChartConfig

/** Tooltip row: series label in muted ink, value right-aligned in mono. */
function tooltipRow(config: ChartConfig, format: (value: number) => string) {
  return (value: unknown, name: unknown) => (
    <div className="flex w-full items-center justify-between gap-4">
      <span className="text-muted-foreground">
        {config[name as string]?.label ?? String(name)}
      </span>
      <span className="font-mono font-medium tabular-nums">
        {format(Number(value))}
      </span>
    </div>
  )
}

const percentTooltip = tooltipRow(cpuChartConfig, (v) => `${Math.round(v)}%`)
const bytesTooltip = tooltipRow(memoryChartConfig, formatBytes)
const msTooltip = tooltipRow(loopChartConfig, formatMs)
const countTooltip = tooltipRow(workChartConfig, (v) => String(Math.round(v)))

interface ChartPoint {
  sampledAt: number
  label: string
  systemCpu: number | null
  appCpu: number | null
  rss: number
  heapUsed: number
  loopDelayMs: number | null
  activeLanes: number
  queuedJobs: number
}

const timeAxisProps = {
  dataKey: "label",
  tickLine: false,
  axisLine: false,
  tickMargin: 6,
  minTickGap: 48,
} as const

function ResourceCharts({ history }: { history: ChartPoint[] }) {
  if (history.length < 2) {
    return (
      <SettingsRow
        title="Collecting history"
        description="Trends appear once the server has gathered a few samples."
      >
        <ActivityIcon className="size-4 text-muted-foreground" />
      </SettingsRow>
    )
  }

  return (
    <div className="grid gap-3 py-3.5">
      <ChartPanel
        title="CPU"
        description="App server process next to overall computer usage."
      >
        <ChartContainer
          config={cpuChartConfig}
          className="aspect-auto h-48 w-full"
        >
          <LineChart data={history} margin={{ left: 0, right: 8, top: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis {...timeAxisProps} />
            <YAxis
              domain={[0, 100]}
              tickLine={false}
              axisLine={false}
              width={36}
              tickFormatter={(value) => `${Math.round(Number(value))}%`}
            />
            <ChartTooltip
              content={<ChartTooltipContent formatter={percentTooltip} />}
            />
            <Line
              type="monotone"
              dataKey="appCpu"
              stroke="var(--color-appCpu)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="systemCpu"
              stroke="var(--color-systemCpu)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
              connectNulls
            />
            <ChartLegend content={<ChartLegendContent />} />
          </LineChart>
        </ChartContainer>
      </ChartPanel>

      <div className="grid gap-3 lg:grid-cols-2">
        <ChartPanel
          title="App memory"
          description="Resident set size and the live JS heap inside it."
        >
          <ChartContainer
            config={memoryChartConfig}
            className="aspect-auto h-44 w-full"
          >
            <AreaChart data={history} margin={{ left: 0, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis {...timeAxisProps} />
              <YAxis
                domain={[0, "auto"]}
                tickLine={false}
                axisLine={false}
                width={52}
                tickFormatter={(value) => formatBytes(Number(value))}
              />
              <ChartTooltip
                content={<ChartTooltipContent formatter={bytesTooltip} />}
              />
              <Area
                type="monotone"
                dataKey="rss"
                stroke="var(--color-rss)"
                fill="var(--color-rss)"
                fillOpacity={0.1}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
              />
              <Area
                type="monotone"
                dataKey="heapUsed"
                stroke="var(--color-heapUsed)"
                fill="var(--color-heapUsed)"
                fillOpacity={0.1}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
              />
              <ChartLegend content={<ChartLegendContent />} />
            </AreaChart>
          </ChartContainer>
        </ChartPanel>

        <ChartPanel
          title="Event loop delay"
          description="How long the server's event loop is blocked. Spikes mean sluggish responses."
        >
          <ChartContainer
            config={loopChartConfig}
            className="aspect-auto h-44 w-full"
          >
            <AreaChart data={history} margin={{ left: 0, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis {...timeAxisProps} />
              <YAxis
                domain={[0, "auto"]}
                tickLine={false}
                axisLine={false}
                width={44}
                tickFormatter={(value) => formatMs(Number(value))}
              />
              <ChartTooltip
                content={<ChartTooltipContent formatter={msTooltip} />}
              />
              <Area
                type="monotone"
                dataKey="loopDelayMs"
                stroke="var(--color-loopDelayMs)"
                fill="var(--color-loopDelayMs)"
                fillOpacity={0.1}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
                connectNulls
              />
            </AreaChart>
          </ChartContainer>
        </ChartPanel>
      </div>

      <ChartPanel
        title="Background work"
        description="Queue lanes running and jobs waiting behind them, stacked."
      >
        <ChartContainer
          config={workChartConfig}
          className="aspect-auto h-36 w-full"
        >
          <AreaChart data={history} margin={{ left: 0, right: 8, top: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis {...timeAxisProps} />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              width={28}
            />
            <ChartTooltip
              content={<ChartTooltipContent formatter={countTooltip} />}
            />
            <Area
              type="stepAfter"
              dataKey="activeLanes"
              stackId="work"
              stroke="var(--color-activeLanes)"
              fill="var(--color-activeLanes)"
              fillOpacity={0.18}
              strokeWidth={2}
            />
            <Area
              type="stepAfter"
              dataKey="queuedJobs"
              stackId="work"
              stroke="var(--color-queuedJobs)"
              fill="var(--color-queuedJobs)"
              fillOpacity={0.18}
              strokeWidth={2}
            />
            <ChartLegend content={<ChartLegendContent />} />
          </AreaChart>
        </ChartContainer>
      </ChartPanel>
    </div>
  )
}

// ── Background queues ─────────────────────────────────────────────────────────

function QueueStatus({ queue }: { queue: BackgroundQueueStats }) {
  const active = queue.active || queue.pending > 0
  const labels = [
    ...(queue.activeLabel ? [`Running ${queue.activeLabel}`] : []),
    ...queue.pendingLabels.map((label) => `Queued ${label}`),
  ]

  return (
    <div className="flex items-start justify-between gap-4 py-3.5">
      <div className="flex min-w-0 gap-3">
        <span
          className={cn(
            "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border [&_svg]:size-3.5",
            active
              ? "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400"
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          )}
        >
          {active ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <CheckCircle2Icon />
          )}
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium">{queue.lane}</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[0.65rem] text-muted-foreground">
              {queue.pending} pending
            </span>
          </div>
          <p className="text-xs/relaxed text-muted-foreground">
            {active ? labels.join(" · ") : "Idle"}
          </p>
        </div>
      </div>
      <span
        className={cn(
          "mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-[0.65rem] font-medium",
          active
            ? "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400"
            : "border-border bg-muted/40 text-muted-foreground"
        )}
      >
        {queue.active ? "Running" : "Waiting"}
      </span>
    </div>
  )
}

// ── Storage ───────────────────────────────────────────────────────────────────

const storageSegments = [
  { key: "databaseBytes", label: "Database", color: "var(--chart-1)" },
  { key: "attachmentsBytes", label: "Attachments", color: "var(--chart-3)" },
  { key: "worktreesBytes", label: "Worktrees", color: "var(--chart-5)" },
  { key: "otherBytes", label: "Everything else", color: "var(--muted-foreground)" },
] as const

const storageDescriptions: Record<string, string> = {
  databaseBytes: "Threads, messages, settings, and the memory index",
  attachmentsBytes: "Images and files pasted or uploaded into chats",
  worktreesBytes: "Managed git worktrees created for threads",
  otherBytes: "Agents, modes, prompts, skills, and logs",
}

function StorageBreakdown({ storage }: { storage: ResourceStorageStats }) {
  const total = Math.max(storage.totalBytes, 1)

  return (
    <div className="flex flex-col gap-3 py-3.5">
      <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full">
        {storageSegments.map(({ key, label, color }) => {
          const share = storage[key] / total
          if (share <= 0) return null
          return (
            <span
              key={key}
              title={`${label} · ${formatBytes(storage[key])}`}
              className="h-full rounded-[2px] first:rounded-l-full last:rounded-r-full"
              style={{
                width: `${Math.max(share * 100, 0.75)}%`,
                backgroundColor: color,
                opacity: key === "otherBytes" ? 0.45 : 0.9,
              }}
            />
          )
        })}
      </div>

      <div className="flex flex-col divide-y divide-border/40">
        {storageSegments.map(({ key, label, color }) => (
          <div
            key={key}
            className="flex items-center justify-between gap-4 py-2"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <span
                className="size-2 shrink-0 rounded-[2px]"
                style={{
                  backgroundColor: color,
                  opacity: key === "otherBytes" ? 0.45 : 0.9,
                }}
              />
              <div className="flex min-w-0 flex-col">
                <span className="text-sm">{label}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {storageDescriptions[key]}
                </span>
              </div>
            </div>
            <span className="shrink-0 text-sm tabular-nums">
              {formatBytes(storage[key])}
            </span>
          </div>
        ))}
        <div className="flex items-center justify-between gap-4 py-2">
          <div className="flex min-w-0 flex-col">
            <span className="text-sm font-medium">Total</span>
            <span className="truncate text-xs text-muted-foreground">
              {storage.fileCount.toLocaleString()} files in {storage.dataDir} ·
              measured {formatTime(storage.computedAt)}
            </span>
          </div>
          <span className="shrink-0 text-sm font-medium tabular-nums">
            {formatBytes(storage.totalBytes)}
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Section ───────────────────────────────────────────────────────────────────

function sparkSeries(
  history: ChartPoint[],
  pick: (point: ChartPoint) => number | null
): (number | null)[] {
  return history.slice(-SPARKLINE_POINTS).map(pick)
}

function OverviewTiles({
  data,
  history,
}: {
  data: ResourceSnapshot | undefined
  history: ChartPoint[]
}) {
  const outstandingWork = data
    ? data.queues.filter((queue) => queue.active).length +
      data.queues.reduce((total, queue) => total + queue.pending, 0)
    : null

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatTile
        label="App CPU"
        value={data ? formatPercent(data.process.cpuPercent) : "—"}
        detail={data ? `PID ${data.process.pid}` : "Collecting"}
        points={sparkSeries(history, (point) => point.appCpu)}
      />
      <StatTile
        label="App memory"
        value={data ? formatBytes(data.process.memory.rss) : "—"}
        detail={
          data
            ? `Heap ${formatBytes(data.process.memory.heapUsed)} of ${formatBytes(
                data.process.memory.heapTotal
              )}`
            : "Collecting"
        }
        points={sparkSeries(history, (point) => point.rss)}
      />
      <StatTile
        label="Event loop delay"
        value={data ? formatMs(data.process.eventLoop.meanMs) : "—"}
        detail={
          data && data.process.eventLoop.maxMs !== null
            ? `Peak ${formatMs(data.process.eventLoop.maxMs)}`
            : "Collecting"
        }
        points={sparkSeries(history, (point) => point.loopDelayMs)}
      />
      <StatTile
        label="Background work"
        value={outstandingWork !== null ? String(outstandingWork) : "—"}
        detail={
          data
            ? `${data.queues.filter((queue) => queue.active).length} running · ${data.queues.reduce(
                (total, queue) => total + queue.pending,
                0
              )} queued`
            : "Collecting"
        }
        points={sparkSeries(
          history,
          (point) => point.activeLanes + point.queuedJobs
        )}
      />
    </div>
  )
}

export function ResourcesSection() {
  const { data, isError, error } = useResourceSnapshot()

  const history = useMemo<ChartPoint[]>(
    () =>
      (data?.history ?? []).map((point) => ({
        sampledAt: point.sampledAt,
        label: formatTime(point.sampledAt),
        systemCpu: point.systemCpu,
        appCpu: point.appCpu,
        rss: point.rss,
        heapUsed: point.heapUsed,
        loopDelayMs: point.loopDelayMs,
        activeLanes: point.activeLanes,
        queuedJobs: point.queuedJobs,
      })),
    [data?.history]
  )

  const activeQueues = data?.queues.filter(
    (queue) => queue.active || queue.pending > 0
  )

  if (isError) {
    return (
      <SettingsGroup title="Live resources">
        <SettingsRow
          title="Unable to load resource monitor"
          description={
            error instanceof Error
              ? error.message
              : "The server did not return resource data."
          }
        >
          <AlertCircleIcon className="size-4 text-destructive" />
        </SettingsRow>
      </SettingsGroup>
    )
  }

  return (
    <>
      <SettingsGroup
        title="Live overview"
        description={
          data
            ? `Sampled every 2 seconds on the local server. Last sample ${formatTime(
                data.sampledAt
              )}.`
            : "Sampled every 2 seconds on the local server."
        }
      >
        <div className="grid gap-3 py-3.5">
          <OverviewTiles data={data} history={history} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Meter
              icon={<CpuIcon />}
              label="Computer CPU"
              value={data ? formatPercent(data.system.cpuPercent) : "loading"}
              detail={
                data
                  ? `${data.system.cpuCount} cores · ${data.system.cpuModel}`
                  : "Collecting the first sample"
              }
              percent={data?.system.cpuPercent}
            />
            <Meter
              icon={<MemoryStickIcon />}
              label="Computer memory"
              value={
                data ? formatPercent(data.system.memoryPercent) : "loading"
              }
              detail={
                data
                  ? `${formatBytes(data.system.usedMemory)} of ${formatBytes(
                      data.system.totalMemory
                    )}`
                  : "Reading system memory"
              }
              percent={data?.system.memoryPercent}
            />
          </div>
        </div>
      </SettingsGroup>

      <SettingsGroup
        title="Trends"
        description="Rolling 5-minute window kept on the server, so history survives reloads."
      >
        <ResourceCharts history={history} />
      </SettingsGroup>

      <SettingsGroup
        title="Background work"
        description="Indexing and other queued application jobs currently running in the local server."
      >
        {!data || data.queues.length === 0 ? (
          <SettingsRow
            title="No background queues yet"
            description="Queues appear here after the app schedules background work."
          >
            <ServerIcon className="size-4 text-muted-foreground" />
          </SettingsRow>
        ) : activeQueues && activeQueues.length > 0 ? (
          activeQueues.map((queue) => (
            <QueueStatus key={queue.lane} queue={queue} />
          ))
        ) : (
          <SettingsRow
            title="All background work is idle"
            description={`${data.queues.length} queue${
              data.queues.length === 1 ? "" : "s"
            } ready.`}
          >
            <CheckCircle2Icon className="size-4 text-emerald-600 dark:text-emerald-400" />
          </SettingsRow>
        )}
      </SettingsGroup>

      <SettingsGroup
        title="Storage"
        description="Disk space used by the app's data directory. Remeasured every few minutes."
      >
        {data?.storage ? (
          <StorageBreakdown storage={data.storage} />
        ) : (
          <SettingsRow
            title="Measuring storage"
            description="Walking the data directory in the background — large worktrees can take a moment."
          >
            <DatabaseIcon className="size-4 text-muted-foreground" />
          </SettingsRow>
        )}
      </SettingsGroup>

      <SettingsGroup
        title="Runtime"
        description="Details about the local server process and this computer."
      >
        <SettingsRow
          title="Server process"
          description={
            data
              ? `PID ${data.process.pid} · Node ${data.process.nodeVersion}`
              : "Waiting for the first sample"
          }
        >
          <span className="text-sm text-muted-foreground">
            {data ? `up ${formatDuration(data.process.uptimeSeconds)}` : "—"}
          </span>
        </SettingsRow>
        <SettingsRow
          title="JS heap limit"
          description="Maximum heap V8 will allocate before the server runs out of memory."
        >
          <span className="text-sm tabular-nums text-muted-foreground">
            {data ? formatBytes(data.process.heapLimit) : "—"}
          </span>
        </SettingsRow>
        <SettingsRow
          title="This computer"
          description={
            data
              ? `${data.system.platform} ${data.system.arch} · ${data.system.cpuModel}`
              : "Waiting for the first sample"
          }
        >
          <span className="text-sm text-muted-foreground">
            {data ? `${data.system.cpuCount} cores` : "—"}
          </span>
        </SettingsRow>
        <SettingsRow
          title="Load average"
          description="Average runnable processes over the last 1, 5, and 15 minutes."
        >
          <span className="text-sm tabular-nums text-muted-foreground">
            {data
              ? data.system.loadAverage
                  .map((value) => value.toFixed(2))
                  .join(" · ")
              : "—"}
          </span>
        </SettingsRow>
        <SettingsRow
          title="System uptime"
          description="Time since this computer last booted."
        >
          <span className="text-sm text-muted-foreground">
            {data ? formatDuration(data.system.uptimeSeconds) : "—"}
          </span>
        </SettingsRow>
      </SettingsGroup>
    </>
  )
}
