import { useEffect, useSyncExternalStore, type ReactNode } from "react"
import {
  ActivityIcon,
  AlertCircleIcon,
  CheckCircle2Icon,
  CpuIcon,
  HardDriveIcon,
  Loader2Icon,
  MemoryStickIcon,
  ServerIcon,
} from "lucide-react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts"

import { SettingsGroup, SettingsRow } from "../components/settings-ui"
import { useResourceSnapshot } from "../queries"
import { Progress } from "@/shared/ui/progress"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/shared/ui/chart"
import { cn } from "@/shared/lib/utils"
import type { BackgroundQueueStats, ResourceSnapshot } from "../api"

const MAX_HISTORY_POINTS = 60

interface ResourceHistoryPoint {
  sampledAt: number
  label: string
  systemCpu: number | null
  appCpu: number | null
  systemMemory: number
  appHeap: number
  activeWork: number
  queuedWork: number
}

let resourceHistory: ResourceHistoryPoint[] = []
const resourceHistoryListeners = new Set<() => void>()

function subscribeResourceHistory(listener: () => void): () => void {
  resourceHistoryListeners.add(listener)
  return () => resourceHistoryListeners.delete(listener)
}

function getResourceHistory(): ResourceHistoryPoint[] {
  return resourceHistory
}

function toFinitePercent(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null
  }
  return Math.max(0, Math.min(100, value))
}

function appendResourceSample(snapshot: ResourceSnapshot): void {
  if (resourceHistory.at(-1)?.sampledAt === snapshot.sampledAt) return

  const queues = snapshot.queues
  const point: ResourceHistoryPoint = {
    sampledAt: snapshot.sampledAt,
    label: new Date(snapshot.sampledAt).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    }),
    systemCpu: toFinitePercent(snapshot.system.cpuPercent),
    appCpu: toFinitePercent(snapshot.process.cpuPercent),
    systemMemory: toFinitePercent(snapshot.system.memoryPercent) ?? 0,
    appHeap:
      snapshot.process.memory.heapTotal > 0
        ? Math.max(
            0,
            Math.min(
              100,
              (snapshot.process.memory.heapUsed /
                snapshot.process.memory.heapTotal) *
                100
            )
          )
        : 0,
    activeWork: queues.filter((queue) => queue.active).length,
    queuedWork: queues.reduce((total, queue) => total + queue.pending, 0),
  }

  resourceHistory = [...resourceHistory, point].slice(-MAX_HISTORY_POINTS)
  for (const listener of resourceHistoryListeners) listener()
}

function useResourceHistory(snapshot: ResourceSnapshot | undefined) {
  useEffect(() => {
    if (snapshot) appendResourceSample(snapshot)
  }, [snapshot])

  return useSyncExternalStore(
    subscribeResourceHistory,
    getResourceHistory,
    getResourceHistory
  )
}

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

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "unknown"
  const days = Math.floor(seconds / 86_400)
  const hours = Math.floor((seconds % 86_400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
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

const cpuChartConfig = {
  systemCpu: { label: "Computer CPU", color: "var(--chart-1)" },
  appCpu: { label: "App server CPU", color: "var(--chart-2)" },
} satisfies ChartConfig

const memoryChartConfig = {
  systemMemory: { label: "Computer memory", color: "var(--chart-3)" },
  appHeap: { label: "App heap", color: "var(--chart-4)" },
} satisfies ChartConfig

const workChartConfig = {
  activeWork: { label: "Running queues", color: "var(--chart-2)" },
  queuedWork: { label: "Queued jobs", color: "var(--chart-5)" },
} satisfies ChartConfig

function formatChartPercent(value: unknown): string {
  return `${Math.round(Number(value))}%`
}

function formatChartCount(value: unknown): string {
  return String(Math.round(Number(value)))
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

function ResourceCharts({ history }: { history: ResourceHistoryPoint[] }) {
  if (history.length < 2) {
    return (
      <SettingsRow
        title="Collecting graph history"
        description="Graphs appear after two live samples."
      >
        <ActivityIcon className="size-4 text-muted-foreground" />
      </SettingsRow>
    )
  }

  return (
    <div className="grid gap-3 py-3.5">
      <ChartPanel
        title="CPU trend"
        description="Computer and app server CPU over the recent samples."
      >
        <ChartContainer
          config={cpuChartConfig}
          className="aspect-auto h-44 w-full"
        >
          <AreaChart data={history} margin={{ left: 0, right: 0, top: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={6}
              minTickGap={28}
            />
            <YAxis
              domain={[0, 100]}
              tickLine={false}
              axisLine={false}
              width={36}
              tickFormatter={formatChartPercent}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, name) => (
                    <div className="flex w-full items-center justify-between gap-4">
                      <span className="text-muted-foreground">
                        {cpuChartConfig[name as keyof typeof cpuChartConfig]
                          ?.label ?? name}
                      </span>
                      <span className="font-mono font-medium tabular-nums">
                        {formatChartPercent(value)}
                      </span>
                    </div>
                  )}
                />
              }
            />
            <Area
              type="monotone"
              dataKey="systemCpu"
              stroke="var(--color-systemCpu)"
              fill="var(--color-systemCpu)"
              fillOpacity={0.14}
              strokeWidth={1.5}
              dot={false}
              connectNulls
            />
            <Area
              type="monotone"
              dataKey="appCpu"
              stroke="var(--color-appCpu)"
              fill="var(--color-appCpu)"
              fillOpacity={0.12}
              strokeWidth={1.5}
              dot={false}
              connectNulls
            />
          </AreaChart>
        </ChartContainer>
      </ChartPanel>

      <div className="grid gap-3 lg:grid-cols-2">
        <ChartPanel
          title="Memory trend"
          description="Computer memory and app heap usage."
        >
          <ChartContainer
            config={memoryChartConfig}
            className="aspect-auto h-40 w-full"
          >
            <AreaChart data={history} margin={{ left: 0, right: 0, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={6}
                minTickGap={32}
              />
              <YAxis
                domain={[0, 100]}
                tickLine={false}
                axisLine={false}
                width={36}
                tickFormatter={formatChartPercent}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => (
                      <div className="flex w-full items-center justify-between gap-4">
                        <span className="text-muted-foreground">
                          {memoryChartConfig[
                            name as keyof typeof memoryChartConfig
                          ]?.label ?? name}
                        </span>
                        <span className="font-mono font-medium tabular-nums">
                          {formatChartPercent(value)}
                        </span>
                      </div>
                    )}
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="systemMemory"
                stroke="var(--color-systemMemory)"
                fill="var(--color-systemMemory)"
                fillOpacity={0.14}
                strokeWidth={1.5}
                dot={false}
              />
              <Area
                type="monotone"
                dataKey="appHeap"
                stroke="var(--color-appHeap)"
                fill="var(--color-appHeap)"
                fillOpacity={0.12}
                strokeWidth={1.5}
                dot={false}
              />
            </AreaChart>
          </ChartContainer>
        </ChartPanel>

        <ChartPanel
          title="Background work"
          description="Running queues and queued jobs."
        >
          <ChartContainer
            config={workChartConfig}
            className="aspect-auto h-40 w-full"
          >
            <BarChart data={history} margin={{ left: 0, right: 0, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={6}
                minTickGap={32}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                width={28}
                tickFormatter={formatChartCount}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => (
                      <div className="flex w-full items-center justify-between gap-4">
                        <span className="text-muted-foreground">
                          {workChartConfig[name as keyof typeof workChartConfig]
                            ?.label ?? name}
                        </span>
                        <span className="font-mono font-medium tabular-nums">
                          {formatChartCount(value)}
                        </span>
                      </div>
                    )}
                  />
                }
              />
              <Bar dataKey="activeWork" fill="var(--color-activeWork)" />
              <Bar dataKey="queuedWork" fill="var(--color-queuedWork)" />
            </BarChart>
          </ChartContainer>
        </ChartPanel>
      </div>
    </div>
  )
}

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

export function ResourcesSection() {
  const { data, isLoading, isError, error } = useResourceSnapshot()
  const history = useResourceHistory(data)
  const activeQueues = data?.queues.filter(
    (queue) => queue.active || queue.pending > 0
  )
  const lastUpdated = data
    ? new Date(data.sampledAt).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      })
    : null

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
        title="Live resources"
        description={
          lastUpdated
            ? `Refreshing every 2 seconds. Last sample ${lastUpdated}.`
            : "Refreshing every 2 seconds."
        }
      >
        <div className="grid gap-3 py-3.5 sm:grid-cols-2">
          <Meter
            icon={<CpuIcon />}
            label="Computer CPU"
            value={
              isLoading ? "loading" : formatPercent(data?.system.cpuPercent)
            }
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
            value={data ? formatPercent(data.system.memoryPercent) : "loading"}
            detail={
              data
                ? `${formatBytes(data.system.usedMemory)} of ${formatBytes(
                    data.system.totalMemory
                  )}`
                : "Reading system memory"
            }
            percent={data?.system.memoryPercent}
          />
          <Meter
            icon={<ActivityIcon />}
            label="App server CPU"
            value={
              isLoading ? "loading" : formatPercent(data?.process.cpuPercent)
            }
            detail={
              data
                ? `PID ${data.process.pid} · up ${formatDuration(
                    data.process.uptimeSeconds
                  )}`
                : "Collecting the first sample"
            }
            percent={data?.process.cpuPercent}
          />
          <Meter
            icon={<HardDriveIcon />}
            label="App memory"
            value={data ? formatBytes(data.process.memory.rss) : "loading"}
            detail={
              data
                ? `Heap ${formatBytes(data.process.memory.heapUsed)} of ${formatBytes(
                    data.process.memory.heapTotal
                  )}`
                : "Reading process memory"
            }
            percent={
              data && data.process.memory.heapTotal > 0
                ? (data.process.memory.heapUsed /
                    data.process.memory.heapTotal) *
                  100
                : 0
            }
          />
        </div>
      </SettingsGroup>

      <SettingsGroup
        title="Graphs"
        description={`Rolling trends for the last ${MAX_HISTORY_POINTS} live samples.`}
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
    </>
  )
}
