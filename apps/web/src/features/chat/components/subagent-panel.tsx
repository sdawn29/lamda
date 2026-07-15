import { memo, useEffect, useMemo, useRef } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  AlertCircleIcon,
  BotIcon,
  CheckCircle2Icon,
  CircleDashedIcon,
  CircleStopIcon,
  LoaderCircleIcon,
  type LucideIcon,
} from "lucide-react"

import { formatDuration } from "@/shared/lib/formatters"
import { cn } from "@/shared/lib/utils"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/shared/ui/accordion"
import { Badge } from "@/shared/ui/badge"
import { AgentModelBadge } from "./agent-info"
import { colorStyle, resolveModeIcon } from "./mode-combobox"
import { SubagentTranscript, useElapsed } from "./subagent-card"
import { RollingTimerText } from "./working-block"
import { listMessages } from "../api"
import {
  delegateAgentId,
  delegateDescription,
  getSubagentDetails,
  isDelegateToolMessage,
  subagentStatus,
  type SubagentRunStatus,
} from "../lib/subagent"
import {
  selectSubagent,
  useSubagentPanelSnapshot,
} from "../lib/subagent-panel-store"
import { blocksToMessages, type ToolMessage } from "../types"

const HISTORY_PAGE_SIZE = 100

const STATUS_META: Record<
  SubagentRunStatus,
  {
    label: string
    icon: LucideIcon
    variant: "secondary" | "outline" | "destructive"
  }
> = {
  queued: { label: "Queued", icon: CircleDashedIcon, variant: "outline" },
  running: { label: "Running", icon: LoaderCircleIcon, variant: "secondary" },
  done: { label: "Done", icon: CheckCircle2Icon, variant: "outline" },
  error: { label: "Failed", icon: AlertCircleIcon, variant: "destructive" },
  aborted: { label: "Stopped", icon: CircleStopIcon, variant: "outline" },
}

function statusDuration(msg: ToolMessage): number | undefined {
  const details = getSubagentDetails(msg)
  if (details?.startedAt && details.endedAt) {
    return details.endedAt - details.startedAt
  }
  return msg.duration
}

async function fetchSubagentHistory(sessionId: string): Promise<ToolMessage[]> {
  const pages: ToolMessage[][] = []
  let before: number | undefined
  let hasMore = true

  while (hasMore) {
    const response = await listMessages(sessionId, {
      limit: HISTORY_PAGE_SIZE,
      before,
    })
    const page = blocksToMessages(response.blocks).filter(
      (message): message is ToolMessage =>
        message.role === "tool" && isDelegateToolMessage(message)
    )
    pages.unshift(page)

    const oldestBlockIndex = response.blocks[0]?.blockIndex
    if (
      !response.hasMore ||
      oldestBlockIndex === undefined ||
      oldestBlockIndex === before
    ) {
      hasMore = false
    } else {
      before = oldestBlockIndex
    }
  }

  const byId = new Map<string, ToolMessage>()
  for (const run of pages.flat()) byId.set(run.toolCallId, run)
  return [...byId.values()]
}

function SubagentStatus({ status }: { status: SubagentRunStatus }) {
  const meta = STATUS_META[status]
  const StatusIcon = meta.icon

  return (
    <Badge variant={meta.variant} className="h-4 px-1.5 font-normal">
      <StatusIcon className={cn(status === "running" && "animate-spin")} />
      {meta.label}
    </Badge>
  )
}

const SubagentAccordionRun = memo(function SubagentAccordionRun({
  msg,
  rootPath,
}: {
  msg: ToolMessage
  rootPath?: string
}) {
  const details = getSubagentDetails(msg)
  const status = subagentStatus(msg)
  const running = status === "running"
  const label = details?.agentLabel || delegateAgentId(msg.args) || "Subagent"
  const description = delegateDescription(msg.args) || "Delegated task"
  const visual = { Icon: resolveModeIcon(details?.icon ?? "bot") }
  const accent = colorStyle(details?.color ?? "violet").iconAccent
  const startedAt = details?.startedAt ?? msg.startTime
  const elapsed = useElapsed(startedAt, running)
  const duration = running ? elapsed : statusDuration(msg)
  const transcriptRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!running) return
    const element = transcriptRef.current
    if (element) element.scrollTop = element.scrollHeight
  }, [details, running])

  return (
    <AccordionItem
      value={msg.toolCallId}
      className="bg-transparent data-open:bg-muted/20"
    >
      <AccordionTrigger className="items-center gap-2.5 px-3 py-2.5 hover:no-underline">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted/60">
          <visual.Icon className={cn("size-3.5", accent)} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-xs font-medium text-foreground">
              {label}
            </span>
            <SubagentStatus status={status} />
          </span>
          <span className="mt-0.5 block truncate text-2xs font-normal text-muted-foreground">
            {description}
          </span>
        </span>
        {duration !== undefined && (
          <span className="shrink-0 text-2xs font-normal text-muted-foreground tabular-nums">
            {running ? (
              <RollingTimerText text={formatDuration(duration)} />
            ) : (
              formatDuration(duration)
            )}
          </span>
        )}
      </AccordionTrigger>
      <AccordionContent className="pb-2">
        <div className="mb-2 flex min-h-5 items-center gap-2 text-2xs text-muted-foreground">
          <AgentModelBadge model={details?.model} />
          {details?.stats?.toolCalls ? (
            <span>
              {details.stats.toolCalls}{" "}
              {details.stats.toolCalls === 1 ? "tool" : "tools"}
            </span>
          ) : null}
        </div>
        <div
          ref={transcriptRef}
          className="max-h-[min(24rem,55vh)] overflow-y-auto rounded-md border bg-background px-2.5 py-2"
        >
          <div className="flex flex-col gap-1">
            <SubagentTranscript msg={msg} rootPath={rootPath} />
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  )
})

export const SubagentPanel = memo(function SubagentPanel({
  runs,
  selectedId,
  onSelect,
  rootPath,
}: {
  runs: ToolMessage[]
  selectedId: string | null
  onSelect: (toolCallId: string | null) => void
  rootPath?: string
}) {
  const activeCount = runs.filter((run) => {
    const status = subagentStatus(run)
    return status === "running" || status === "queued"
  }).length

  return (
    <section aria-label="Subagents" className="h-full min-h-0 bg-background">
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex h-9 shrink-0 items-center gap-2 border-b px-3 text-2xs text-muted-foreground">
          <span>
            {runs.length} {runs.length === 1 ? "run" : "runs"}
          </span>
          {activeCount > 0 && (
            <>
              <span aria-hidden>·</span>
              <span>{activeCount} active</span>
            </>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <Accordion
            value={selectedId ? [selectedId] : []}
            onValueChange={(value) => onSelect(value[0] ?? null)}
            className="rounded-lg shadow-none"
          >
            {runs.map((run) => (
              <SubagentAccordionRun
                key={run.toolCallId}
                msg={run}
                rootPath={rootPath}
              />
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  )
})

export const SubagentDockPanel = memo(function SubagentDockPanel({
  sessionId,
  rootPath,
}: {
  sessionId: string
  rootPath?: string
}) {
  const snapshot = useSubagentPanelSnapshot(sessionId)
  const history = useQuery({
    queryKey: ["chat", "session", sessionId, "subagents"],
    queryFn: () => fetchSubagentHistory(sessionId),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
  const runs = useMemo(() => {
    const byId = new Map(
      (history.data ?? []).map((run) => [run.toolCallId, run])
    )
    for (const run of snapshot.runs) byId.set(run.toolCallId, run)
    return [...byId.values()]
  }, [history.data, snapshot.runs])

  if (history.isPending && runs.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Loading subagents…
      </div>
    )
  }

  if (runs.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <BotIcon className="size-5 text-muted-foreground" />
        <p className="text-sm font-medium">No subagents yet</p>
        <p className="max-w-56 text-xs text-muted-foreground">
          Every delegated run in this thread will appear here.
        </p>
      </div>
    )
  }

  const selectedId =
    snapshot.selectedId &&
    runs.some((run) => run.toolCallId === snapshot.selectedId)
      ? snapshot.selectedId
      : null

  return (
    <SubagentPanel
      runs={runs}
      selectedId={selectedId}
      onSelect={(toolCallId) => selectSubagent(sessionId, toolCallId)}
      rootPath={rootPath}
    />
  )
})
