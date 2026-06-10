import { memo, useEffect, useMemo, useRef, useState } from "react"
import { ChevronRightIcon } from "lucide-react"
import { cn } from "@/shared/lib/utils"
import { formatDuration } from "@/shared/lib/formatters"
import { ThinkingBlock } from "./thinking-block"
import { ToolCallBlock, argsSummary, fileBasename, isSkillRead } from "./tool-call-block"
import { QUESTION_TOOL_NAME } from "../lib/active-question"
import type { AssistantMessage, ToolMessage } from "../types"

export type WorkingMessage = AssistantMessage | ToolMessage

const SHIMMER_TEXT_CLASS =
  "animate-thinking-shimmer bg-linear-to-r from-muted-foreground/40 via-foreground to-muted-foreground/40 bg-size-[200%_100%] bg-clip-text text-transparent"

/**
 * Read-only lookup tools whose consecutive calls collapse into a single
 * "Read · 4 files" style row. Mutating tools (edit, write, bash…) always
 * stay individually visible.
 */
const GROUPABLE_TOOLS = new Set([
  "read",
  "plan_read",
  "grep",
  "glob",
  "find",
  "search",
  "websearch",
  "web_search",
  "webfetch",
  "web_fetch",
  "fetch",
])

function isReadTool(name: string): boolean {
  return name === "read" || name === "plan_read"
}

function runNoun(toolName: string, count: number): string {
  const name = toolName.toLowerCase()
  const noun = isReadTool(name) ? "file" : name.includes("fetch") ? "page" : "search"
  return `${count} ${noun}${count === 1 ? "" : "s"}`
}

/** A collapsed run of consecutive same-tool calls inside a working block. */
function ToolRunGroup({
  tools,
  rootPath,
}: {
  tools: ToolMessage[]
  rootPath?: string
}) {
  const [expanded, setExpanded] = useState(false)
  const toolName = tools[0].toolName
  const running = tools.some((t) => t.status === "running")
  const errored = tools.some((t) => t.status === "error")
  const preview = tools
    .map((t) => {
      const s = argsSummary(t.args, rootPath)
      return isReadTool(toolName.toLowerCase()) ? fileBasename(s) : s
    })
    .filter(Boolean)
    .join(", ")

  return (
    <div className="w-full text-xs">
      <button
        type="button"
        className="group/row flex w-full min-w-0 items-center gap-1.5 text-left"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
      >
        <span
          className={cn(
            "shrink-0 text-sm font-medium",
            running
              ? SHIMMER_TEXT_CLASS
              : errored
                ? "text-destructive/70"
                : "text-muted-foreground/45"
          )}
        >
          {toolName}
        </span>
        <span className="shrink-0 text-sm tabular-nums text-muted-foreground/45">
          {runNoun(toolName, tools.length)}
        </span>
        {preview && (
          <span className="min-w-0 truncate text-sm text-muted-foreground/35">
            {preview}
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
          <div className="mt-1.5 ml-[3px] flex flex-col gap-1.5 border-l border-border/40 pl-3">
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
 * Flatten messages into visible rows, collapsing consecutive same-tool
 * lookup calls into runs. Hidden thinking (showThinking off) doesn't split a
 * run, since it renders nothing between the calls anyway.
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
    const groupable =
      GROUPABLE_TOOLS.has(t.toolName.toLowerCase()) && !isSkillRead(t)
    const last = out[out.length - 1]
    if (
      groupable &&
      last?.kind === "run" &&
      last.tools[0].toolName.toLowerCase() === t.toolName.toLowerCase()
    ) {
      last.tools.push(t)
      continue
    }
    if (groupable) {
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
        className="flex items-center gap-1.5 text-left"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
      >
        <span
          className={cn(
            "text-sm font-medium",
            isActive ? "text-foreground/60" : "text-muted-foreground"
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
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground/40">
            · {toolCount} {toolCount === 1 ? "step" : "steps"}
          </span>
        )}

        <ChevronRightIcon
          className={cn(
            "h-3 w-3 shrink-0 text-muted-foreground/30 transition-transform duration-200",
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
          <div className="mt-2 ml-[3px] flex flex-col gap-1.5 border-l border-border/40 pl-4">
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
