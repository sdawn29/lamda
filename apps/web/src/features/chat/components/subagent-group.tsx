import { memo, useEffect, useRef, useState } from "react"
import { BotIcon } from "lucide-react"
import { cn } from "@/shared/lib/utils"
import { formatDuration } from "@/shared/lib/formatters"
import { colorStyle, resolveModeIcon } from "./mode-combobox"
import {
  CollapsibleBody,
  DISCLOSURE_DIM,
  DISCLOSURE_LABEL_DONE,
  DISCLOSURE_ROW_CLASS,
  DisclosureChevron,
  NESTED_BODY_CLASS,
  SHIMMER_TEXT_CLASS,
} from "./disclosure"
import { SubagentTranscript, useElapsed } from "./subagent-card"
import { RollingTimerText } from "./working-block"
import {
  describeSubagentActivity,
  getSubagentDetails,
  subagentStatus,
  taskAgentId,
  taskDescription,
} from "../lib/subagent"
import type { ToolMessage } from "../types"

/**
 * One subagent as a minimal status tile: icon + name with the task
 * description underneath, and — while running — a dim state word (current
 * tool / thinking) beside a ticking timer. All tiles in a group are visible
 * at once — this is the "glance" layer; clicking a tile focuses its full
 * transcript in the panel below the grid.
 */
const SubagentTile = memo(function SubagentTile({
  msg,
  selected,
  onSelect,
}: {
  msg: ToolMessage
  selected: boolean
  onSelect: () => void
}) {
  const details = getSubagentDetails(msg)
  const status = subagentStatus(msg)
  const running = status === "running"
  const failed = status === "error"
  const aborted = status === "aborted"

  const label = details?.agentLabel ?? (taskAgentId(msg.args) || "Subagent")
  const description = taskDescription(msg.args)
  // resolveModeIcon returns module-cached components, so identity is stable
  // across renders; rendering via the wrapper's property (`visual.Icon`) keeps
  // the react-compiler static-components rule satisfied.
  const visual = { Icon: resolveModeIcon(details?.icon ?? "bot") }
  const accent = colorStyle(details?.color ?? "violet").iconAccent

  const startedAt = details?.startedAt ?? msg.startTime
  const elapsed = useElapsed(startedAt, running)
  const settledDuration =
    details?.endedAt && details.startedAt
      ? details.endedAt - details.startedAt
      : msg.duration

  const activity = details && running ? describeSubagentActivity(details) : null

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex min-w-0 flex-col gap-0.5 rounded-md border px-2 py-1.5 text-left transition-colors",
        selected
          ? "border-border/70 bg-muted/40"
          : "border-border/40 hover:bg-muted/25",
        failed && !selected && "border-destructive/30"
      )}
    >
      <span className="flex w-full min-w-0 items-center gap-1.5">
        <visual.Icon
          className={cn(
            "h-3 w-3 shrink-0",
            running
              ? cn("animate-pulse", accent)
              : failed
                ? "text-destructive/60"
                : cn(accent, aborted ? "opacity-40" : "opacity-70")
          )}
        />
        <span
          className={cn(
            "min-w-0 truncate font-medium",
            running
              ? SHIMMER_TEXT_CLASS
              : failed
                ? "text-destructive/70"
                : aborted
                  ? "text-muted-foreground/50"
                  : "text-muted-foreground/70"
          )}
        >
          {label}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5 text-2xs text-muted-foreground/45 tabular-nums">
          {running && activity && (
            <span className="max-w-24 truncate">{activity}</span>
          )}
          {status === "queued" ? (
            "queued"
          ) : running ? (
            <RollingTimerText text={formatDuration(elapsed)} />
          ) : failed ? (
            <span className="text-destructive/60">failed</span>
          ) : aborted ? (
            "aborted"
          ) : settledDuration ? (
            formatDuration(settledDuration)
          ) : (
            "done"
          )}
        </span>
      </span>
      {description && (
        <span className="w-full truncate pl-[18px] text-2xs text-muted-foreground/45">
          {description}
        </span>
      )}
    </button>
  )
})

/**
 * The focused subagent's full transcript, in a bounded scroll region beneath
 * the tile grid. While the run is live it stays pinned to the newest rows;
 * scrolling up releases the pin so the user can read back without fighting
 * the stream.
 */
function SubagentFocusPanel({
  msg,
  rootPath,
}: {
  msg: ToolMessage
  rootPath?: string
}) {
  const details = getSubagentDetails(msg)
  const live = subagentStatus(msg) === "running"
  const scrollRef = useRef<HTMLDivElement>(null)
  const pinnedRef = useRef(true)

  useEffect(() => {
    if (!live || !pinnedRef.current) return
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [live, details])

  return (
    <div
      ref={scrollRef}
      onScroll={() => {
        const el = scrollRef.current
        if (!el) return
        pinnedRef.current =
          el.scrollHeight - el.scrollTop - el.clientHeight < 24
      }}
      className="max-h-80 overflow-y-auto rounded-md border border-border/40 bg-muted/15 px-3 py-2.5"
    >
      <div className="flex flex-col gap-1">
        <SubagentTranscript msg={msg} rootPath={rootPath} />
      </div>
    </div>
  )
}

/**
 * Group block for two or more `task` tool calls launched together (parallel
 * subagents). Every agent is visible at once as a compact live tile — status,
 * current activity, ticking timer — so a fleet of parallel runs can be
 * watched at a glance; clicking a tile opens that agent's full transcript in
 * a focus panel below (click again to close). Like SubagentCard, the whole
 * block stays open while any agent is live and collapses to a one-line
 * summary once all have settled.
 */
export function SubagentGroup({
  tools,
  isNew = true,
  entryDelayMs = 0,
  rootPath,
}: {
  tools: ToolMessage[]
  isNew?: boolean
  entryDelayMs?: number
  rootPath?: string
}) {
  const statuses = tools.map(subagentStatus)
  const anyRunning = statuses.includes("running")
  const anyLive = anyRunning || statuses.includes("queued")
  const anyErrored = statuses.includes("error")
  const doneCount = statuses.filter(
    (s) => s !== "running" && s !== "queued"
  ).length

  // null = follow the default (open while any agent is live, collapsed once
  // all settle); a click pins the user's choice.
  const [userExpanded, setUserExpanded] = useState<boolean | null>(null)
  const expanded = userExpanded ?? anyLive

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = tools.find((t) => t.toolCallId === selectedId)

  const allDetails = tools.map(getSubagentDetails)
  const groupStart = allDetails.reduce<number | undefined>((min, d, i) => {
    const start = d?.startedAt ?? tools[i].startTime
    if (start === undefined) return min
    return min === undefined ? start : Math.min(min, start)
  }, undefined)
  const groupElapsed = useElapsed(groupStart, anyRunning)
  const groupEnd = allDetails.reduce<number | undefined>((max, d) => {
    if (d?.endedAt === undefined) return max
    return max === undefined ? d.endedAt : Math.max(max, d.endedAt)
  }, undefined)
  const wallDuration =
    groupStart !== undefined && groupEnd !== undefined
      ? groupEnd - groupStart
      : undefined
  const totalTools = allDetails.reduce(
    (n, d) => n + (d?.stats?.toolCalls ?? 0),
    0
  )

  return (
    <div
      className={cn("w-full text-xs", isNew && "animate-chat-message-in")}
      style={
        isNew && entryDelayMs > 0
          ? { animationDelay: `${entryDelayMs}ms` }
          : undefined
      }
    >
      <button
        type="button"
        className={DISCLOSURE_ROW_CLASS}
        onClick={() => setUserExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <BotIcon
          className={cn(
            "h-3 w-3 shrink-0",
            anyRunning
              ? "animate-pulse text-foreground/50"
              : anyErrored
                ? "text-destructive/60"
                : "text-muted-foreground/40"
          )}
        />
        <span
          className={cn(
            "shrink-0 font-medium",
            anyLive
              ? SHIMMER_TEXT_CLASS
              : anyErrored
                ? "text-destructive/70"
                : DISCLOSURE_LABEL_DONE
          )}
        >
          {tools.length} agents
        </span>
        <span
          className={cn("min-w-0 flex-1 truncate text-2xs", DISCLOSURE_DIM)}
        >
          {anyLive
            ? `${doneCount}/${tools.length} done`
            : anyErrored
              ? "finished with errors"
              : totalTools > 0
                ? `${totalTools} tools`
                : "done"}
        </span>
        {anyRunning && groupStart !== undefined && (
          <span className="shrink-0 text-2xs text-muted-foreground/60 tabular-nums">
            <RollingTimerText text={formatDuration(groupElapsed)} />
          </span>
        )}
        {!anyLive && wallDuration !== undefined && (
          <span
            className={cn("shrink-0 text-2xs tabular-nums", DISCLOSURE_DIM)}
          >
            {formatDuration(wallDuration)}
          </span>
        )}
        <DisclosureChevron expanded={expanded} revealOnHover={!anyLive} />
      </button>

      <CollapsibleBody open={expanded}>
        <div className={NESTED_BODY_CLASS}>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-1.5">
            {tools.map((t) => (
              <SubagentTile
                key={t.toolCallId}
                msg={t}
                selected={t.toolCallId === selectedId}
                onSelect={() =>
                  setSelectedId((id) =>
                    id === t.toolCallId ? null : t.toolCallId
                  )
                }
              />
            ))}
          </div>
          {selected && (
            <SubagentFocusPanel
              key={selected.toolCallId}
              msg={selected}
              rootPath={rootPath}
            />
          )}
        </div>
      </CollapsibleBody>
    </div>
  )
}
