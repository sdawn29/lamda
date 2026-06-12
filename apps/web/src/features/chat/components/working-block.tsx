import { memo, useEffect, useMemo, useRef, useState } from "react"
import {
  ChevronRightIcon,
  FilePenLineIcon,
  GlobeIcon,
  SearchIcon,
  SquareTerminalIcon,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/shared/lib/utils"
import { formatDuration } from "@/shared/lib/formatters"
import { ThinkingBlock } from "./thinking-block"
import { ToolCallBlock, argsSummary, isSkillRead } from "./tool-call-block"
import { QUESTION_TOOL_NAME } from "../lib/active-question"
import type { AssistantMessage, ToolMessage } from "../types"

export type WorkingMessage = AssistantMessage | ToolMessage

const SHIMMER_TEXT_CLASS =
  "animate-thinking-shimmer bg-linear-to-r from-muted-foreground/40 via-foreground to-muted-foreground/40 bg-size-[200%_100%] bg-clip-text text-transparent"

/**
 * Tool-group categories. Consecutive calls to tools in the same category
 * collapse into a single verbose row, e.g. "Exploring · read 4 files, ran
 * 2 searches, ran 1 command". Tools not mapped here (todo, question,
 * plan_write…) always stay individually visible.
 */
type ToolGroupId = "exploring" | "terminal" | "web" | "editing"

const TOOL_GROUP_IDS: Record<string, ToolGroupId> = {
  read: "exploring",
  plan_read: "exploring",
  grep: "exploring",
  glob: "exploring",
  find: "exploring",
  ls: "exploring",
  search: "exploring",
  // bash gets its own group — it can mutate state, so it shouldn't read as exploring
  bash: "terminal",
  websearch: "web",
  web_search: "web",
  webfetch: "web",
  web_fetch: "web",
  fetch: "web",
  edit: "editing",
  // plan_write intentionally excluded — its PlanSavedCard CTA must stay visible
  write: "editing",
}

const TOOL_GROUP_META: Record<
  ToolGroupId,
  { activeLabel: string; doneLabel: string; icon: LucideIcon }
> = {
  exploring: { activeLabel: "Exploring", doneLabel: "Explored", icon: SearchIcon },
  terminal: {
    activeLabel: "Running commands",
    doneLabel: "Ran commands",
    icon: SquareTerminalIcon,
  },
  web: {
    activeLabel: "Searching the web",
    doneLabel: "Searched the web",
    icon: GlobeIcon,
  },
  editing: { activeLabel: "Editing", doneLabel: "Edited", icon: FilePenLineIcon },
}

function toolGroupId(t: ToolMessage): ToolGroupId | null {
  if (isSkillRead(t)) return null
  return TOOL_GROUP_IDS[t.toolName.toLowerCase()] ?? null
}

function isReadTool(name: string): boolean {
  return name === "read" || name === "plan_read"
}

/** Verbose action phrase per tool kind, keyed off the call count. */
const ACTION_PHRASES: Record<string, (n: number) => string> = {
  read: (n) => `read ${n} file${n === 1 ? "" : "s"}`,
  command: (n) => `ran ${n} command${n === 1 ? "" : "s"}`,
  list: (n) => `listed ${n} director${n === 1 ? "y" : "ies"}`,
  search: (n) => `ran ${n} search${n === 1 ? "" : "es"}`,
  websearch: (n) => `searched ${n} quer${n === 1 ? "y" : "ies"}`,
  fetch: (n) => `fetched ${n} page${n === 1 ? "" : "s"}`,
  edit: (n) => `edited ${n} file${n === 1 ? "" : "s"}`,
  write: (n) => `wrote ${n} file${n === 1 ? "" : "s"}`,
}

function actionKind(name: string): string {
  if (isReadTool(name)) return "read"
  if (name === "bash") return "command"
  if (name === "ls") return "list"
  if (name === "edit") return "edit"
  if (name === "write") return "write"
  if (name === "websearch" || name === "web_search") return "websearch"
  if (name.includes("fetch")) return "fetch"
  return "search"
}

/** "read 4 files, ran 2 searches, ran 1 command" for a collapsed run. */
function describeRun(tools: ToolMessage[]): string {
  const counts = new Map<string, number>()
  for (const t of tools) {
    const kind = actionKind(t.toolName.toLowerCase())
    counts.set(kind, (counts.get(kind) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([kind, n]) => ACTION_PHRASES[kind](n))
    .join(", ")
}

/**
 * Build the collapsed description for a tool run group, appending file/query
 * names for file-based and web groups so the summary is immediately legible.
 */
function buildGroupDescription(
  tools: ToolMessage[],
  groupId: ToolGroupId,
  rootPath?: string
): string {
  if (groupId === "terminal") {
    return tools
      .map((t) => argsSummary(t.args, rootPath))
      .filter(Boolean)
      .join(" · ")
  }

  const runDesc = describeRun(tools)

  const names = [
    ...new Set(
      tools
        .map((t) => {
          const s = argsSummary(t.args, rootPath)
          if (!s) return null
          if (groupId === "web") {
            const q = s.length > 26 ? `${s.slice(0, 26)}…` : s
            return `"${q}"`
          }
          return s.split("/").pop() ?? s
        })
        .filter((n): n is string => n !== null && n.length > 0)
    ),
  ]

  if (names.length === 0) return runDesc
  const shown = names.slice(0, 3).join(", ")
  const extra = names.length > 3 ? ` +${names.length - 3}` : ""
  return `${runDesc} · ${shown}${extra}`
}

/** Category + count breakdown for the working block collapsed header. */
function getCategoryBreakdown(
  messages: WorkingMessage[]
): { groupId: ToolGroupId; count: number }[] {
  const counts = new Map<ToolGroupId, number>()
  for (const m of messages) {
    if (m.role !== "tool") continue
    const gid = toolGroupId(m as ToolMessage)
    if (gid) counts.set(gid, (counts.get(gid) ?? 0) + 1)
  }
  return [...counts.entries()].map(([groupId, count]) => ({ groupId, count }))
}

/** A collapsed run of consecutive same-category tool calls inside a working block. */
function ToolRunGroup({
  tools,
  rootPath,
}: {
  tools: ToolMessage[]
  rootPath?: string
}) {
  const [expanded, setExpanded] = useState(false)
  const groupId = toolGroupId(tools[0]) ?? "exploring"
  const meta = TOOL_GROUP_META[groupId]
  const GroupIcon = meta.icon
  const running = tools.some((t) => t.status === "running")
  const errored = tools.some((t) => t.status === "error")
  const errorCount = tools.filter((t) => t.status === "error").length
  const description = buildGroupDescription(tools, groupId, rootPath)

  return (
    <div className="w-full text-xs">
      <button
        type="button"
        className="group/row flex w-full min-w-0 items-center gap-1.5 text-left"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
      >
        <GroupIcon
          className={cn(
            "h-3.5 w-3.5 shrink-0",
            running
              ? "animate-pulse text-foreground/50"
              : errored
                ? "text-destructive/60"
                : "text-muted-foreground/40"
          )}
        />
        <span
          className={cn(
            "shrink-0 text-sm font-medium",
            running
              ? SHIMMER_TEXT_CLASS
              : errored
                ? "text-destructive/70"
                : "text-muted-foreground/55"
          )}
        >
          {running ? meta.activeLabel : meta.doneLabel}
        </span>
        <span
          className={cn(
            "shrink-0 rounded-full px-1.5 py-px text-2xs tabular-nums",
            running
              ? "bg-primary/10 text-primary/60"
              : errored
                ? "bg-destructive/10 text-destructive/60"
                : "bg-muted/60 text-muted-foreground/60"
          )}
        >
          {tools.length}
        </span>
        {description && (
          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground/40">
            {description}
          </span>
        )}
        {!running && errorCount > 0 && (
          <span className="shrink-0 text-2xs tabular-nums text-destructive/50">
            {errorCount} err
          </span>
        )}
        <ChevronRightIcon
          className={cn(
            "h-3 w-3 shrink-0 text-muted-foreground/30 transition-all duration-200",
            expanded
              ? "rotate-90 opacity-100"
              : "opacity-0 group-hover/row:opacity-100"
          )}
        />
      </button>

      <div
        className={cn(
          "grid transition-all duration-300 ease-in-out",
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          <div className="mt-1.5 ml-[3px] flex flex-col gap-1.5 border-l border-border/50 pl-3">
            {tools.map((t) => (
              <ToolCallBlock
                key={t.toolCallId}
                msg={t}
                isNew={false}
                rootPath={rootPath}
                suppressPlanSavedCard
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/** One renderable row in the working block body. */
type WorkingEntry =
  | { kind: "thinking"; key: string; thinking: string }
  | { kind: "tool"; key: string; msg: ToolMessage }
  | { kind: "run"; key: string; tools: ToolMessage[] }

/**
 * Flatten messages into visible rows, collapsing consecutive calls of
 * same-category tools (exploring, web, editing) into verbose runs. Hidden
 * thinking (showThinking off) doesn't split a run, since it renders nothing
 * between the calls anyway.
 */
function buildWorkingEntries(
  messages: WorkingMessage[],
  showThinking: boolean
): WorkingEntry[] {
  const out: WorkingEntry[] = []
  for (const m of messages) {
    if (m.role === "assistant") {
      const a = m as AssistantMessage
      if (showThinking && a.thinking.trim()) {
        out.push({ kind: "thinking", key: `thinking-${out.length}`, thinking: a.thinking })
      }
      continue
    }
    const t = m as ToolMessage
    const groupId = toolGroupId(t)
    const last = out[out.length - 1]
    if (
      groupId !== null &&
      last?.kind === "run" &&
      toolGroupId(last.tools[0]) === groupId
    ) {
      last.tools.push(t)
      continue
    }
    if (groupId !== null) {
      out.push({ kind: "run", key: t.toolCallId, tools: [t] })
      continue
    }
    out.push({ kind: "tool", key: t.toolCallId, msg: t })
  }
  // Single-call runs render as a plain tool row
  return out.map((e) =>
    e.kind === "run" && e.tools.length === 1
      ? { kind: "tool" as const, key: e.key, msg: e.tools[0] }
      : e
  )
}

export function RollingTimerText({ text }: { text: string }) {
  return (
    <span className="tabular-nums">
      {text.split("").map((char, i) =>
        /\d/.test(char) ? (
          <span
            key={i}
            className="inline-block"
            style={{ clipPath: "inset(0)" }}
          >
            <span
              key={char}
              className="inline-block"
              style={{ animation: "digit-in 180ms ease-out" }}
            >
              {char}
            </span>
          </span>
        ) : (
          <span key={i}>{char}</span>
        )
      )}
    </span>
  )
}

interface WorkingBlockProps {
  messages: WorkingMessage[]
  isActive: boolean
  showThinking: boolean
  isNew?: boolean
  /** Stagger offset (ms) applied as CSS animation-delay when isNew is true. */
  entryDelayMs?: number
  finalThinking?: string
  rootPath?: string
}

function computeHistoricalDuration(messages: WorkingMessage[]): number {
  const tools = messages.filter((m): m is ToolMessage => m.role === "tool")
  const starts = tools
    .map((t) => t.startTime)
    .filter((s): s is number => s != null)
  const ends = tools
    .filter((t) => t.startTime != null && t.duration != null)
    .map((t) => t.startTime! + t.duration!)

  if (starts.length > 0 && ends.length > 0) {
    return Math.max(...ends) - Math.min(...starts)
  }
  const toolDuration = tools.reduce((sum, t) => sum + (t.duration ?? 0), 0)
  if (toolDuration > 0) return toolDuration

  // Thinking-only block: use responseTime from assistant messages
  return messages
    .filter((m): m is AssistantMessage => m.role === "assistant")
    .reduce((sum, a) => sum + (a.responseTime ?? 0), 0)
}

export const WorkingBlock = memo(function WorkingBlock({
  messages,
  isActive,
  showThinking,
  isNew = true,
  entryDelayMs = 0,
  finalThinking,
  rootPath,
}: WorkingBlockProps) {
  const startTimeRef = useRef<number | null>(null)
  const prevActiveRef = useRef(isActive)

  const [expanded, setExpanded] = useState(isActive)
  const [elapsed, setElapsed] = useState(0)
  const [finalDuration, setFinalDuration] = useState<number | null>(null)

  // Derive earliest timestamp from messages — stable input for the start-time effect below
  const earliestTimestamp = useMemo(() => {
    const ts: number[] = []
    for (const m of messages) {
      if (m.role === "assistant" && (m as AssistantMessage).createdAt != null)
        ts.push((m as AssistantMessage).createdAt!)
      else if (m.role === "tool" && (m as ToolMessage).startTime != null)
        ts.push((m as ToolMessage).startTime!)
    }
    return ts.length > 0 ? Math.min(...ts) : null
  }, [messages])

  // Record start time once when first activated
  useEffect(() => {
    if (isActive && startTimeRef.current === null) {
      startTimeRef.current = earliestTimestamp ?? Date.now()
    }
  }, [isActive, earliestTimestamp])

  // Live elapsed counter while active
  useEffect(() => {
    if (!isActive) return
    const update = () => {
      if (startTimeRef.current !== null) {
        setElapsed(Date.now() - startTimeRef.current)
      }
    }
    update()
    const id = setInterval(update, 100)
    return () => clearInterval(id)
  }, [isActive])

  // Auto-collapse + capture duration when work finishes
  // messages omitted from deps — displayDuration useMemo handles historical fallback
  useEffect(() => {
    const wasActive = prevActiveRef.current
    prevActiveRef.current = isActive

    if (wasActive && !isActive) {
      const duration =
        startTimeRef.current !== null ? Date.now() - startTimeRef.current : null
      if (duration !== null) setFinalDuration(duration)
      setExpanded(false)
    }
  }, [isActive])

  const displayDuration = useMemo(
    () => finalDuration ?? computeHistoricalDuration(messages),
    [finalDuration, messages]
  )

  // While the agent is blocked on a `question` tool it isn't actually working —
  // it's idle waiting on the user. Suppress the ticking "Working for…" timer in
  // that window and show a calm waiting label instead.
  const pendingQuestion =
    isActive &&
    messages.some(
      (m) =>
        m.role === "tool" &&
        (m as ToolMessage).toolName === QUESTION_TOOL_NAME &&
        (m as ToolMessage).status === "running"
    )

  const hasTools = messages.some((m) => m.role === "tool")
  const toolCount = useMemo(
    () => messages.filter((m) => m.role === "tool").length,
    [messages]
  )
  const categoryBreakdown = useMemo(
    () => (!isActive ? getCategoryBreakdown(messages) : []),
    [isActive, messages]
  )
  const entries = useMemo(
    () => buildWorkingEntries(messages, showThinking),
    [messages, showThinking]
  )
  const hasThinkingContent = messages.some(
    (m) =>
      m.role === "assistant" && (m as AssistantMessage).thinking.trim().length > 0
  )
  const hasFinalThinking = showThinking && !!finalThinking?.trim()
  const hasVisibleContent = hasTools || (showThinking && hasThinkingContent) || hasFinalThinking

  if (!hasVisibleContent) return null

  return (
    <div
      className={cn(
        "w-full text-xs",
        isNew && "animate-chat-message-in"
      )}
      style={
        isNew && entryDelayMs > 0
          ? { animationDelay: `${entryDelayMs}ms` }
          : undefined
      }
    >
      {/* Trigger row — looks like inline text, no card chrome */}
      <button
        type="button"
        className="flex w-full min-w-0 items-center gap-1.5 text-left"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
      >
        {isActive && !pendingQuestion && (
          <span className="relative flex h-1.5 w-1.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/50" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary/80" />
          </span>
        )}
        <span
          className={cn(
            "shrink-0 text-sm font-medium",
            isActive ? "text-foreground/65" : "text-muted-foreground/70"
          )}
        >
          {isActive ? (
            pendingQuestion ? (
              "Waiting for your answer"
            ) : (
              <>Working for <RollingTimerText text={formatDuration(elapsed)} /></>
            )
          ) : displayDuration > 0 ? (
            `Worked for ${formatDuration(displayDuration)}`
          ) : (
            "Worked briefly"
          )}
        </span>

        {!isActive && toolCount > 0 && (
          <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground/40">
            <span className="shrink-0 text-xs tabular-nums">
              · {toolCount} {toolCount === 1 ? "tool" : "tools"}
            </span>
            {categoryBreakdown.length > 0 && (
              <span className="flex shrink-0 items-center gap-1">
                {categoryBreakdown.map(({ groupId, count }) => {
                  const meta = TOOL_GROUP_META[groupId]
                  const CatIcon = meta.icon
                  return (
                    <span
                      key={groupId}
                      className="flex items-center gap-0.5 text-muted-foreground/35"
                      title={`${meta.doneLabel}: ${count}`}
                    >
                      <CatIcon className="h-2.5 w-2.5" />
                      <span className="text-2xs tabular-nums">{count}</span>
                    </span>
                  )
                })}
              </span>
            )}
          </span>
        )}

        <ChevronRightIcon
          className={cn(
            "ml-auto h-3 w-3 shrink-0 text-muted-foreground/30 transition-transform duration-200",
            expanded && "rotate-90"
          )}
        />
      </button>

      {/* Collapsible content */}
      <div
        className={cn(
          "grid transition-all duration-300 ease-in-out",
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          <div className="mt-2 ml-[3px] flex flex-col gap-2 border-l border-border/50 pl-4">
            {entries.map((entry) => {
              if (entry.kind === "thinking") {
                return (
                  <ThinkingBlock
                    key={entry.key}
                    thinking={entry.thinking}
                    isNew={isNew}
                  />
                )
              }
              if (entry.kind === "run") {
                return (
                  <ToolRunGroup
                    key={entry.key}
                    tools={entry.tools}
                    rootPath={rootPath}
                  />
                )
              }
              return (
                <ToolCallBlock
                  key={entry.key}
                  msg={entry.msg}
                  isNew={false}
                  rootPath={rootPath}
                  suppressPlanSavedCard
                />
              )
            })}
            {hasFinalThinking && finalThinking && (
              <ThinkingBlock thinking={finalThinking} isNew={isNew} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
})
