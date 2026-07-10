import { memo, useEffect, useMemo, useRef, useState } from "react"
import Markdown from "react-markdown"
import { cn } from "@/shared/lib/utils"
import { formatDuration } from "@/shared/lib/formatters"
import { colorStyle, resolveModeIcon } from "./mode-combobox"
import { getMarkdownComponents } from "./markdown-components"
import { ThinkingBlock } from "./thinking-block"
import { ToolCallBlock, toolDisplayName } from "./tool-call-block"
import { RollingTimerText, ToolRunGroup, toolGroupId } from "./working-block"
import {
  CollapsibleBody,
  DISCLOSURE_DIM,
  DISCLOSURE_LABEL_DONE,
  DISCLOSURE_ROW_CLASS,
  DisclosureChevron,
  NESTED_BODY_CLASS,
  SHIMMER_TEXT_CLASS,
} from "./disclosure"
import {
  describeSubagentActivity,
  getSubagentDetails,
  subagentBlocksToMessages,
  subagentStatus,
  delegateDescription,
} from "../lib/subagent"
import type { Message, ToolMessage } from "../types"

/** One renderable row in a subagent card's nested transcript. */
type SubagentEntry =
  | { kind: "assistant"; key: string; content: string; thinking: string }
  | { kind: "tool"; key: string; msg: ToolMessage }
  | { kind: "run"; key: string; tools: ToolMessage[] }

/**
 * Flatten a subagent's transcript into visible rows, collapsing consecutive
 * calls of same-category tools (exploring, terminal, editing — see
 * {@link toolGroupId}) into a single "Exploring · read 4 files" run, the same
 * treatment the main transcript's WorkingBlock gives the top-level agent's
 * own tool calls. Assistant text (including the subagent's final report) is
 * kept as its own entry, since — unlike WorkingBlock — a subagent's reply
 * text lives inside this same collapsible body rather than as a sibling
 * message.
 */
function buildSubagentEntries(messages: Message[]): SubagentEntry[] {
  const out: SubagentEntry[] = []
  let assistantIndex = 0
  for (const m of messages) {
    if (m.role === "assistant") {
      if (m.content.trim() || m.thinking.trim()) {
        out.push({
          kind: "assistant",
          key: `assistant-${assistantIndex++}`,
          content: m.content,
          thinking: m.thinking,
        })
      }
      continue
    }
    if (m.role !== "tool") continue
    const groupId = toolGroupId(m)
    const last = out[out.length - 1]
    if (
      groupId !== null &&
      last?.kind === "run" &&
      toolGroupId(last.tools[0]) === groupId
    ) {
      last.tools.push(m)
      continue
    }
    if (groupId !== null) {
      out.push({ kind: "run", key: m.toolCallId, tools: [m] })
      continue
    }
    out.push({ kind: "tool", key: m.toolCallId, msg: m })
  }
  return out
}

/**
 * Live elapsed time for a running subagent, anchored to the run's start so a
 * remount mid-run resumes at the right value.
 */
export function useElapsed(
  startedAt: number | undefined,
  active: boolean
): number {
  const [elapsed, setElapsed] = useState(() =>
    startedAt ? Math.max(0, Date.now() - startedAt) : 0
  )
  useEffect(() => {
    if (!active || !startedAt) return
    const update = () => setElapsed(Math.max(0, Date.now() - startedAt))
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [active, startedAt])
  return elapsed
}

/**
 * A subagent run's nested transcript rows — the tool-call blocks, run groups,
 * and reply text of the nested run, without any header chrome. Shared between
 * the standalone SubagentCard's collapsible body and the parallel
 * SubagentGroup's focus panel; render inside a `flex flex-col gap-1` column.
 */
export const SubagentTranscript = memo(function SubagentTranscript({
  msg,
  rootPath,
}: {
  msg: ToolMessage
  rootPath?: string
}) {
  const details = getSubagentDetails(msg)
  const status = subagentStatus(msg)

  // Stabilize settled children's identities across streaming snapshots (each
  // snapshot deserializes to fresh objects) so the memoized ToolCallBlock rows
  // inside a run group don't re-render on every text delta of a later block.
  const childCacheRef = useRef(new Map<string, { sig: string; msg: Message }>())
  const children = useMemo(() => {
    if (!details) return []
    return subagentBlocksToMessages(details.blocks).map((child) => {
      if (child.role !== "tool" || child.status === "running") return child
      const sig = `${child.status}:${child.duration ?? ""}`
      const cached = childCacheRef.current.get(child.toolCallId)
      if (cached && cached.sig === sig) return cached.msg
      childCacheRef.current.set(child.toolCallId, { sig, msg: child })
      return child
    })
  }, [details])

  const entries = useMemo(() => buildSubagentEntries(children), [children])

  const markdownComponents = useMemo(
    () => getMarkdownComponents(rootPath),
    [rootPath]
  )

  return (
    <>
      {details?.truncated && (
        <span className={cn("text-2xs italic", DISCLOSURE_DIM)}>
          Transcript trimmed — middle steps elided
        </span>
      )}
      {entries.map((entry, index) => {
        if (entry.kind === "run") {
          return (
            <ToolRunGroup
              key={entry.key}
              tools={entry.tools}
              rootPath={rootPath}
              live={status === "running" && index === entries.length - 1}
            />
          )
        }
        if (entry.kind === "tool") {
          return (
            <ToolCallBlock
              key={entry.key}
              msg={entry.msg}
              isNew={false}
              rootPath={rootPath}
              suppressPlanSavedCard
            />
          )
        }
        return (
          <div key={entry.key} className="flex flex-col gap-1">
            {entry.thinking.trim() && (
              <ThinkingBlock thinking={entry.thinking} isNew={false} />
            )}
            {entry.content.trim() && (
              <div className="prose prose-sm max-w-none text-xs leading-relaxed text-foreground/80 dark:prose-invert">
                <Markdown components={markdownComponents}>
                  {entry.content}
                </Markdown>
              </div>
            )}
          </div>
        )
      })}
      {details?.errorMessage && (
        <span className="text-2xs text-destructive/70">
          {details.errorMessage}
        </span>
      )}
      {status === "queued" && (
        <span className={cn("text-2xs italic", DISCLOSURE_DIM)}>
          Waiting for a subagent slot…
        </span>
      )}
    </>
  )
})

/**
 * The chat card for a `delegate` tool call — a running subagent. Header shows the
 * agent's identity, live activity, and a ticking timer; the collapsible body
 * renders the subagent's own transcript with the same tool-call blocks as the
 * main conversation (children are never `delegate`, so recursion is one level
 * deep). Open while running, collapsed to a one-liner when settled.
 */
export const SubagentCard = memo(function SubagentCard({
  msg,
  isNew = true,
  entryDelayMs = 0,
  rootPath,
}: {
  msg: ToolMessage
  isNew?: boolean
  entryDelayMs?: number
  rootPath?: string
}) {
  const details = getSubagentDetails(msg)
  const status = subagentStatus(msg)
  const isLive = status === "running" || status === "queued"

  // null = follow the default (open while live, collapsed once settled);
  // a click pins the user's choice.
  const [userExpanded, setUserExpanded] = useState<boolean | null>(null)
  const expanded = userExpanded ?? isLive

  const label = details?.agentLabel ?? "Subagent"
  const description = delegateDescription(msg.args)
  const iconName = details?.icon ?? "bot"
  // resolveModeIcon returns module-cached components, so identity is stable
  // across renders; rendering via the wrapper's property (`visual.Icon`) keeps
  // the react-compiler static-components rule satisfied.
  const visual = { Icon: resolveModeIcon(iconName) }
  const accent = colorStyle(details?.color ?? "violet").iconAccent

  const startedAt = details?.startedAt ?? msg.startTime
  const elapsed = useElapsed(startedAt, status === "running")
  const settledDuration =
    details?.endedAt && details.startedAt
      ? details.endedAt - details.startedAt
      : msg.duration

  const rawActivity =
    details && isLive ? describeSubagentActivity(details) : null
  // MCP tool names are registered as `mcp__<server>__<tool>` — show the
  // humanized tool part, not the internal name.
  const activity = rawActivity ? toolDisplayName(rawActivity) : null
  const toolCount = details?.stats?.toolCalls ?? 0

  // Keep a lone agent's live transcript bounded just like the focus panel used
  // for parallel agents. Follow new output while pinned to the bottom, but
  // release the pin as soon as the user scrolls up to inspect earlier steps.
  const transcriptScrollRef = useRef<HTMLDivElement>(null)
  const transcriptPinnedRef = useRef(true)
  useEffect(() => {
    if (status !== "running" || !transcriptPinnedRef.current) return
    const element = transcriptScrollRef.current
    if (element) element.scrollTop = element.scrollHeight
  }, [status, details])

  const failed = status === "error"
  const aborted = status === "aborted"

  const headerLabel =
    status === "queued" ? (
      <span className={cn("shrink-0 font-medium", DISCLOSURE_DIM)}>
        {label} agent queued…
      </span>
    ) : status === "running" ? (
      <span className={cn("shrink-0 font-medium", SHIMMER_TEXT_CLASS)}>
        {label} agent
      </span>
    ) : (
      <span
        className={cn(
          "shrink-0 font-medium",
          failed
            ? "text-destructive/70"
            : aborted
              ? "text-muted-foreground/50"
              : DISCLOSURE_LABEL_DONE
        )}
      >
        {label} agent
        {failed ? " failed" : aborted ? " aborted" : ""}
      </span>
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
        <visual.Icon
          className={cn(
            "h-3 w-3 shrink-0",
            status === "running"
              ? cn("animate-pulse", accent)
              : failed
                ? "text-destructive/60"
                : cn(accent, "opacity-70")
          )}
        />
        {headerLabel}
        {description && (
          <span className={cn("min-w-0 flex-1 truncate", DISCLOSURE_DIM)}>
            {description}
          </span>
        )}
        {status === "running" && activity && (
          <span className={cn("shrink-0 text-2xs", DISCLOSURE_DIM)}>
            {activity}
          </span>
        )}
        {status === "running" && startedAt && (
          <span className="shrink-0 text-2xs text-muted-foreground/60 tabular-nums">
            <RollingTimerText text={formatDuration(elapsed)} />
          </span>
        )}
        {!isLive && (
          <span
            className={cn("shrink-0 text-2xs tabular-nums", DISCLOSURE_DIM)}
          >
            {toolCount > 0 &&
              `${toolCount} ${toolCount === 1 ? "tool" : "tools"}`}
            {toolCount > 0 && settledDuration ? " · " : ""}
            {settledDuration ? formatDuration(settledDuration) : ""}
          </span>
        )}
        <DisclosureChevron expanded={expanded} revealOnHover={!isLive} />
      </button>

      <CollapsibleBody open={expanded}>
        <div
          ref={transcriptScrollRef}
          onScroll={() => {
            const element = transcriptScrollRef.current
            if (!element) return
            transcriptPinnedRef.current =
              element.scrollHeight - element.scrollTop - element.clientHeight <
              24
          }}
          className={cn(NESTED_BODY_CLASS, "max-h-80 overflow-y-auto pr-2")}
        >
          <SubagentTranscript msg={msg} rootPath={rootPath} />
        </div>
      </CollapsibleBody>
    </div>
  )
})
