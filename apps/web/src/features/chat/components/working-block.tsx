import { memo, useEffect, useMemo, useRef, useState } from "react"
import { ChevronRightIcon } from "lucide-react"
import { cn } from "@/shared/lib/utils"
import { formatDuration } from "@/shared/lib/formatters"
import { ThinkingBlock } from "./thinking-block"
import { ToolCallBlock } from "./tool-call-block"
import type { AssistantMessage, ToolMessage } from "../types"

export type WorkingMessage = AssistantMessage | ToolMessage

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
  return tools.reduce((sum, t) => sum + (t.duration ?? 0), 0)
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

  const hasTools = messages.some((m) => m.role === "tool")
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
            <>Working for <RollingTimerText text={formatDuration(elapsed)} /></>
          ) : displayDuration > 0 ? (
            `Worked for ${formatDuration(displayDuration)}`
          ) : (
            "Worked"
          )}
        </span>

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
          <div className="mt-2 flex flex-col gap-2">
            {messages.map((msg, i) => {
              if (msg.role === "assistant") {
                const a = msg as AssistantMessage
                if (!showThinking || !a.thinking.trim()) return null
                return <ThinkingBlock key={`thinking-${i}`} thinking={a.thinking} isNew={isNew} />
              }
              if (msg.role === "tool") {
                const t = msg as ToolMessage
                return (
                  <ToolCallBlock
                    key={t.toolCallId}
                    msg={t}
                    isNew={false}
                    rootPath={rootPath}
                    suppressPlanSavedCard
                  />
                )
              }
              return null
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
