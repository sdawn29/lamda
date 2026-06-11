import { useEffect, useRef, useCallback } from "react"
import { flushSync } from "react-dom"
import { useQueryClient } from "@tanstack/react-query"

import { openSessionWebSocket, listRunningTools } from "../api"
import { subscribeToSessionEvents, type AgentEndMessage } from "../session-events"
import { messagesQueryKey, chatKeys, updateLastPageMessages, type MessagesInfiniteData } from "../queries"
import { createAssistantMessage, createErrorMessage, blockToMessage, parseErrorMessage } from "../types"
import type { AssistantMessage, Message, ToolMessage } from "../types"
import { gitKeys } from "@/features/git/queries"

// ── Helpers ──────────────────────────────────────────────────────────────────

interface TurnMeta {
  startTime: number
  model?: string
  provider?: string
  thinkingLevel?: string
}

function upsertToolMessage(
  prev: Message[],
  toolCallId: string,
  updater: (existing?: ToolMessage) => ToolMessage
): Message[] {
  const index = prev.findIndex(
    (msg) => msg.role === "tool" && msg.toolCallId === toolCallId
  )
  if (index === -1) return [...prev, updater()]
  return [...prev.slice(0, index), updater(prev[index] as ToolMessage), ...prev.slice(index + 1)]
}

function mergeRunningTools(messages: Message[], runningTools: Message[]): Message[] {
  if (runningTools.length === 0) return messages

  // Check ALL existing tool messages regardless of status — not just running ones.
  // The async listRunningTools fetch in onAgentStart can resolve after tool_start +
  // tool_end have already been processed (completing the tool). Filtering only for
  // status === "running" would miss the completed entry and insert a duplicate.
  const existingIds = new Set(
    messages
      .filter((m): m is ToolMessage => m.role === "tool")
      .map((m) => m.toolCallId)
  )

  const newTools = runningTools.filter(
    (m): m is ToolMessage => m.role === "tool" && !existingIds.has(m.toolCallId)
  )

  if (newTools.length === 0) return messages

  const lastAssistantIdx = messages.reduceRight(
    (found, msg, i) => (found === -1 && msg.role === "assistant" ? i : found),
    -1
  )

  if (lastAssistantIdx === -1) return [...messages, ...newTools]

  const insertIdx = lastAssistantIdx + 1
  return [...messages.slice(0, insertIdx), ...newTools, ...messages.slice(insertIdx)]
}

function appendAssistantDelta(
  prev: Message[],
  type: "text_delta" | "thinking_delta",
  delta: string
): Message[] {
  const last = prev[prev.length - 1]
  if (last?.role !== "assistant") {
    return [
      ...prev,
      type === "thinking_delta"
        ? createAssistantMessage({ thinking: delta })
        : createAssistantMessage({ content: delta }),
    ]
  }
  if (type === "thinking_delta") {
    return [...prev.slice(0, -1), { ...last, thinking: last.thinking + delta }]
  }
  return [...prev.slice(0, -1), { ...last, content: last.content + delta }]
}

function finalizeRunningTools(prev: Message[], runMessages: AgentEndMessage[]): Message[] {
  const toolResults = new Map(
    runMessages
      .filter(
        (msg): msg is Extract<AgentEndMessage, { role: "toolResult" }> =>
          msg.role === "toolResult"
      )
      .map((msg) => [msg.toolCallId, msg])
  )

  const assistantFailure = [...runMessages]
    .reverse()
    .find(
      (msg): msg is Extract<AgentEndMessage, { role: "assistant" }> =>
        msg.role === "assistant" && (msg.stopReason === "aborted" || msg.stopReason === "error")
    )

  const fallbackError = assistantFailure?.errorMessage
    ? assistantFailure.errorMessage
    : assistantFailure?.stopReason === "aborted"
      ? "Operation aborted"
      : "Tool execution ended without a final result."

  return prev.map((msg) => {
    if (msg.role !== "tool" || msg.status !== "running") return msg
    const result = toolResults.get(msg.toolCallId)
    if (result) {
      const duration = msg.startTime ? Date.now() - msg.startTime : msg.duration
      return {
        ...msg,
        toolName: result.toolName || msg.toolName,
        status: result.isError ? "error" : "done",
        result: { content: result.content, details: result.details },
        duration,
      }
    }
    return {
      ...msg,
      status: "error",
      result: msg.result ?? { content: [{ type: "text", text: fallbackError }] },
      duration: msg.duration ?? (msg.startTime ? Date.now() - msg.startTime : undefined),
    }
  })
}

function findLastAssistantIndex(messages: Message[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant") return i
  }
  return -1
}

// ── Queue event types ─────────────────────────────────────────────────────────
//
// Every WebSocket event is normalized into one of these before entering the
// queue. The queue is drained once per animation frame, applying all events
// in arrival order as pure transforms on the messages array, then issuing a
// single setQueryData call and firing side-effects.

type QueuedEvent =
  | { kind: "agent_start"; runningTools: ToolMessage[] }
  | { kind: "message_start" }
  | { kind: "text_delta"; delta: string }
  | { kind: "thinking_delta"; delta: string }
  | { kind: "tool_start"; toolCallId: string; toolName: string; args: unknown; startTime: number }
  | { kind: "tool_update"; toolCallId: string; toolName?: string; args?: unknown; partialResult: unknown }
  | { kind: "tool_end"; toolCallId: string; toolName?: string; status: "done" | "error"; result: unknown; duration?: number }
  | { kind: "agent_end"; agentMessages: AgentEndMessage[]; meta: TurnMeta | null }
  | { kind: "auto_retry_start"; attempt: number; errorMessage: string }
  | { kind: "auto_retry_end"; success: boolean; finalError?: string; lastPrompt: { text: string; thinkingLevel?: string } | null }
  | { kind: "compaction_start"; reason: "manual" | "threshold" | "overflow" }
  | { kind: "compaction_end"; reason: "manual" | "threshold" | "overflow"; errorMessage?: string; aborted?: boolean; willRetry?: boolean }
  | { kind: "server_error"; message: string; lastPrompt: { text: string; thinkingLevel?: string } | null }
  | { kind: "transport_error"; lastPrompt: { text: string; thinkingLevel?: string } | null }

// Pure state transition — no side effects allowed here.
function applyQueuedEvent(msgs: Message[], event: QueuedEvent): Message[] {
  switch (event.kind) {
    case "agent_start":
      return mergeRunningTools(msgs, event.runningTools)

    case "message_start":
      return [...msgs, createAssistantMessage()]

    case "text_delta":
      return appendAssistantDelta(msgs, "text_delta", event.delta)

    case "thinking_delta":
      return appendAssistantDelta(msgs, "thinking_delta", event.delta)

    case "tool_start":
      return upsertToolMessage(msgs, event.toolCallId, (existing) => ({
        role: "tool" as const,
        toolCallId: event.toolCallId,
        toolName: event.toolName ?? existing?.toolName ?? "tool",
        args: event.args ?? existing?.args ?? {},
        status: "running" as const,
        result: existing?.result,
        partialResult: existing?.partialResult,
        duration: existing?.duration,
        startTime: event.startTime,
      }))

    case "tool_update":
      return upsertToolMessage(msgs, event.toolCallId, (existing) => ({
        role: "tool" as const,
        toolCallId: event.toolCallId,
        toolName: event.toolName ?? existing?.toolName ?? "tool",
        args: event.args ?? existing?.args ?? {},
        status: "running" as const,
        result: existing?.result,
        partialResult: event.partialResult,
        duration: existing?.duration,
        startTime: existing?.startTime,
      }))

    case "tool_end": {
      // If agent_end's finalizeRunningTools already settled this tool,
      // skip — applying tool_end on top would cause a spurious re-render.
      const alreadyFinalized = msgs.some(
        (m) => m.role === "tool" &&
          (m as ToolMessage).toolCallId === event.toolCallId &&
          (m as ToolMessage).status !== "running"
      )
      if (alreadyFinalized) return msgs
      return upsertToolMessage(msgs, event.toolCallId, (existing) => ({
        role: "tool" as const,
        toolCallId: event.toolCallId,
        toolName: event.toolName ?? existing?.toolName ?? "tool",
        args: existing?.args ?? {},
        status: event.status,
        result: event.result,
        partialResult: existing?.partialResult,
        duration: event.duration,
        startTime: existing?.startTime,
      }))
    }

    case "compaction_end": {
      if (!event.errorMessage && !event.aborted) {
        return [
          ...msgs,
          {
            role: "compaction" as const,
            id: crypto.randomUUID(),
            reason: event.reason,
            createdAt: Date.now(),
          },
        ]
      }
      return msgs
    }

    case "agent_end": {
      let result = finalizeRunningTools(msgs, event.agentMessages)
      const { meta } = event

      if (meta) {
        const lastIdx = findLastAssistantIndex(result)
        if (lastIdx !== -1) {
          const last = result[lastIdx] as AssistantMessage
          result = [
            ...result.slice(0, lastIdx),
            {
              ...last,
              model: meta.model,
              provider: meta.provider,
              thinkingLevel: meta.thinkingLevel,
              responseTime: Date.now() - meta.startTime,
            },
            ...result.slice(lastIdx + 1),
          ]
        }
      }

      const assistantError = [...event.agentMessages]
        .reverse()
        .find(
          (msg): msg is Extract<AgentEndMessage, { role: "assistant" }> =>
            msg.role === "assistant" && msg.stopReason === "error" && !!msg.errorMessage
        )

      if (assistantError?.errorMessage) {
        const errorText = parseErrorMessage(assistantError.errorMessage)
        const lastIdx = findLastAssistantIndex(result)
        if (lastIdx !== -1) {
          const last = result[lastIdx] as AssistantMessage
          result = [
            ...result.slice(0, lastIdx),
            { ...last, errorMessage: errorText },
            ...result.slice(lastIdx + 1),
          ]
        } else {
          result = [...result, createAssistantMessage({ errorMessage: errorText })]
        }
      }

      return result
    }

    // Side-effect-only events — messages state unchanged.
    default:
      return msgs
  }
}

// ── Per-session stream state ──────────────────────────────────────────────────

type DoneFlag = { current: boolean }
const sessionDoneFlags = new Map<string, DoneFlag>()

function getSessionDoneFlag(sessionId: string): DoneFlag {
  const existing = sessionDoneFlags.get(sessionId)
  if (existing) return existing
  const flag: DoneFlag = { current: false }
  sessionDoneFlags.set(sessionId, flag)
  return flag
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface UseSessionStreamOptions {
  sessionId: string
  onMessageStart?: () => void
  onMessageEnd?: () => void
  onIsLoadingChange?: (loading: boolean) => void
  onIsCompactingChange?: (compacting: boolean) => void
  onCompactionReasonChange?: (reason: "manual" | "threshold" | "overflow" | null) => void
  onPendingErrorChange?: (error: ReturnType<typeof createErrorMessage> | null) => void
  onError?: () => void
  onToolExecutionEnd?: (toolName: string) => void
  onPlanSaved?: (event: { filePath: string; relativePath: string }) => void
}

export function useSessionStream({
  sessionId,
  onMessageStart,
  onMessageEnd,
  onIsLoadingChange,
  onIsCompactingChange,
  onCompactionReasonChange,
  onPendingErrorChange,
  onError,
  onToolExecutionEnd,
  onPlanSaved,
}: UseSessionStreamOptions) {
  const queryClient = useQueryClient()

  // Unified event queue — every WebSocket event lands here in arrival order.
  const eventQueueRef = useRef<QueuedEvent[]>([])
  const rafRef = useRef<number | null>(null)
  // Timeout-based flush used while the document is hidden (rAF doesn't fire
  // there, which would let events — including agent_end — queue indefinitely
  // in a backgrounded window).
  const flushTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Tool start-time tracking for accurate duration on tool_end.
  const pendingToolStartRef = useRef<Map<string, number>>(new Map())

  // Accumulated per-turn metadata (model, provider, thinkingLevel, startTime).
  // Updated synchronously on delta events; snapshotted into agent_end event.
  const turnMetaRef = useRef<TurnMeta | null>(null)

  const lastPromptRef = useRef<{ text: string; thinkingLevel?: string } | null>(null)
  const pendingThinkingLevelRef = useRef<string | null>(null)

  // True while an assistant turn is in progress (message_start → agent_end).
  // Used to suppress spurious transport errors from idle WebSocket closes that
  // happen after agent_end (e.g. server graceful shutdown between turns).
  const agentRunningRef = useRef(false)

  // Always-current callbacks — stored in a ref so the queue processor (which
  // is stable across renders) always calls the latest versions.
  const callbacksRef = useRef({ onMessageStart, onIsLoadingChange, onMessageEnd, onIsCompactingChange, onCompactionReasonChange, onPendingErrorChange, onError, onToolExecutionEnd, onPlanSaved })
  useEffect(() => {
    callbacksRef.current = { onMessageStart, onIsLoadingChange, onMessageEnd, onIsCompactingChange, onCompactionReasonChange, onPendingErrorChange, onError, onToolExecutionEnd, onPlanSaved }
  }, [onMessageStart, onIsLoadingChange, onMessageEnd, onIsCompactingChange, onCompactionReasonChange, onPendingErrorChange, onError, onToolExecutionEnd, onPlanSaved])

  // ── Queue processor ───────────────────────────────────────────────────────
  //
  // Drains the entire queue in one pass:
  //   1. Apply each event as a pure transform → new messages state
  //   2. ONE setQueryData call
  //   3. Fire collected side-effects in arrival order

  const processQueue = useCallback(() => {
    rafRef.current = null
    if (flushTimeoutRef.current !== null) {
      clearTimeout(flushTimeoutRef.current)
      flushTimeoutRef.current = null
    }
    const events = eventQueueRef.current.splice(0)
    if (events.length === 0) return

    const cb = callbacksRef.current
    const sideEffects: Array<() => void> = []

    // ── 1. Pure state transitions ───────────────────────────────────────────
    queryClient.setQueryData<MessagesInfiniteData>(messagesQueryKey(sessionId), (prev) =>
      updateLastPageMessages(prev, (msgs) => {
        for (const event of events) {
          msgs = applyQueuedEvent(msgs, event)
        }
        return msgs
      })
    )

    // ── 2. Collect side-effects in event order ──────────────────────────────
    for (const event of events) {
      switch (event.kind) {
        case "agent_start":
          sideEffects.push(() => cb.onIsLoadingChange?.(true))
          break

        case "message_start":
          sideEffects.push(() => {
            cb.onMessageStart?.()
            cb.onIsLoadingChange?.(true)
          })
          break

        case "tool_end": {
          const { toolName } = event
          if (toolName) {
            sideEffects.push(() => cb.onToolExecutionEnd?.(toolName))
          }
          break
        }

        case "agent_end": {
          const hasError = event.agentMessages.some(
            (msg): boolean =>
              msg.role === "assistant" &&
              (msg as Extract<AgentEndMessage, { role: "assistant" }>).stopReason === "error" &&
              !!(msg as Extract<AgentEndMessage, { role: "assistant" }>).errorMessage
          )
          sideEffects.push(() => {
            cb.onMessageEnd?.()
            cb.onIsLoadingChange?.(false)
            if (hasError) cb.onError?.()
            // Don't invalidate the messages query — the WS stream just wrote
            // the canonical state into cache; refetching now races with the
            // server's async DB write and can briefly replay stale rows.
            void queryClient.invalidateQueries({ queryKey: chatKeys.contextUsage(sessionId) })
            void queryClient.invalidateQueries({ queryKey: chatKeys.sessionStats(sessionId) })
            void queryClient.invalidateQueries({ queryKey: gitKeys.turns(sessionId) })
            // Skip per-file diffs (key[3] === "diff") — see use-chat-stream.ts comment.
            void queryClient.invalidateQueries({
              queryKey: gitKeys.session(sessionId),
              predicate: (query) => (query.queryKey as unknown[])[3] !== "diff",
            })
            void queryClient.invalidateQueries({ queryKey: ["file-tree"] })
          })
          break
        }

        case "auto_retry_start":
          sideEffects.push(() =>
            cb.onPendingErrorChange?.(
              createErrorMessage("Retrying", event.errorMessage, {
                retryable: true,
                retryCount: event.attempt,
                action: { type: "dismiss" },
              })
            )
          )
          break

        case "auto_retry_end":
          if (!event.success && event.finalError) {
            const { lastPrompt, finalError } = event
            sideEffects.push(() => {
              cb.onPendingErrorChange?.(
                createErrorMessage("Retry Failed", finalError, {
                  retryable: true,
                  action: lastPrompt
                    ? { type: "retry", prompt: lastPrompt.text, thinkingLevel: lastPrompt.thinkingLevel }
                    : { type: "dismiss" },
                })
              )
              cb.onError?.()
            })
          } else {
            sideEffects.push(() => cb.onPendingErrorChange?.(null))
          }
          break

        case "compaction_start":
          sideEffects.push(() => {
            cb.onIsCompactingChange?.(true)
            cb.onCompactionReasonChange?.(event.reason)
          })
          break

        case "compaction_end":
          if (event.errorMessage && !event.aborted) {
            const { errorMessage } = event
            sideEffects.push(() => {
              cb.onIsCompactingChange?.(false)
              cb.onCompactionReasonChange?.(null)
              cb.onPendingErrorChange?.(
                createErrorMessage("Compaction Failed", errorMessage, { action: { type: "dismiss" } })
              )
              cb.onError?.()
            })
          } else {
            sideEffects.push(() => {
              cb.onIsCompactingChange?.(false)
              cb.onCompactionReasonChange?.(null)
              cb.onPendingErrorChange?.(null)
              void queryClient.invalidateQueries({ queryKey: chatKeys.contextUsage(sessionId) })
              void queryClient.invalidateQueries({ queryKey: chatKeys.sessionStats(sessionId) })
            })
          }
          break

        case "server_error": {
          const { message, lastPrompt } = event
          sideEffects.push(() => {
            cb.onPendingErrorChange?.(
              createErrorMessage("Error", message, {
                retryable: true,
                action: lastPrompt
                  ? { type: "retry", prompt: lastPrompt.text, thinkingLevel: lastPrompt.thinkingLevel }
                  : { type: "dismiss" },
              })
            )
            cb.onError?.()
            cb.onIsLoadingChange?.(false)
          })
          break
        }

        case "transport_error": {
          const { lastPrompt } = event
          sideEffects.push(() => {
            cb.onPendingErrorChange?.(
              createErrorMessage(
                "Connection Lost",
                "The connection to the server was lost. Please try again.",
                {
                  action: lastPrompt
                    ? { type: "retry", prompt: lastPrompt.text, thinkingLevel: lastPrompt.thinkingLevel }
                    : { type: "dismiss" },
                }
              )
            )
            cb.onError?.()
            cb.onIsLoadingChange?.(false)
            void queryClient.invalidateQueries({ queryKey: messagesQueryKey(sessionId) })
          })
          break
        }
      }
    }

    // ── 3. Fire side-effects after state is settled ─────────────────────────
    for (const effect of sideEffects) effect()
  }, [queryClient, sessionId])

  // Schedule a processQueue on the next animation frame (deduplicated).
  // Hidden documents get a timeout instead — rAF is suspended there.
  const scheduleFlush = useCallback(() => {
    if (rafRef.current !== null || flushTimeoutRef.current !== null) return
    if (document.hidden) {
      flushTimeoutRef.current = setTimeout(processQueue, 32)
    } else {
      rafRef.current = requestAnimationFrame(processQueue)
    }
  }, [processQueue])

  // Flush immediately and force a synchronous React render so that
  // tool_start/agent_end state is committed to the DOM before the next
  // WebSocket message (e.g. tool_end) is processed.  Without flushSync,
  // React 19's automatic batching can merge the running→done transition
  // into a single render, making fast tool blocks (like Write) appear to
  // skip the running state entirely.
  const flushNow = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (flushTimeoutRef.current !== null) {
      clearTimeout(flushTimeoutRef.current)
      flushTimeoutRef.current = null
    }
    flushSync(processQueue)
  }, [processQueue])

  // Enqueue an event and schedule a batched flush.
  const enqueue = useCallback((event: QueuedEvent) => {
    eventQueueRef.current.push(event)
    scheduleFlush()
  }, [scheduleFlush])

  // Enqueue an event and flush synchronously (no RAF delay).
  const enqueueNow = useCallback((event: QueuedEvent) => {
    eventQueueRef.current.push(event)
    flushNow()
  }, [flushNow])

  // ── Main WebSocket effect ─────────────────────────────────────────────────

  useEffect(() => {
    const doneFlag = getSessionDoneFlag(sessionId)
    doneFlag.current = false
    let ws: WebSocket | null = null
    let unsubscribe: (() => void) | undefined
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    async function connect() {
      const socket = await openSessionWebSocket(sessionId)
      if (doneFlag.current) {
        socket?.close()
        return
      }
      if (!socket) {
        doneFlag.current = true
        callbacksRef.current.onIsLoadingChange?.(false)
        return
      }

      ws = socket

      unsubscribe = subscribeToSessionEvents(ws, {

          onAgentStart: () => {
            if (doneFlag.current) return
            // Invalidate turns so the new in-progress turn shows up immediately
            void queryClient.invalidateQueries({ queryKey: gitKeys.turns(sessionId) })
            void (async () => {
              try {
                const { runningTools: blocks } = await listRunningTools(sessionId)
                if (blocks.length === 0 || doneFlag.current) return
                const tools = blocks
                  .map(blockToMessage)
                  .filter((msg): msg is ToolMessage => msg.role === "tool" && msg.status === "running")
                if (tools.length > 0 && !doneFlag.current) {
                  enqueue({ kind: "agent_start", runningTools: tools })
                }
              } catch (e) {
                console.warn("[session-stream] Failed to fetch running tools:", e)
              }
            })()
          },

          onMessageStart: (data) => {
            if (doneFlag.current) return
            if (data.message?.role !== "assistant") return
            agentRunningRef.current = true
            // Preserve thinkingLevel across multiple message_starts within one agent turn.
            // pendingThinkingLevelRef is only populated for the first LLM call; subsequent
            // calls (after tool results) must inherit the level set by the user.
            const inheritedThinkingLevel = turnMetaRef.current?.thinkingLevel
            turnMetaRef.current = {
              startTime: Date.now(),
              thinkingLevel: inheritedThinkingLevel ?? pendingThinkingLevelRef.current ?? undefined,
            }
            pendingThinkingLevelRef.current = null
            enqueue({ kind: "message_start" })
          },

          onMessageUpdate: (data) => {
            if (doneFlag.current) return
            const event = data.assistantMessageEvent
            if (
              event == null ||
              typeof event.delta !== "string" ||
              (event.type !== "text_delta" && event.type !== "thinking_delta")
            ) return

            // Accumulate model/provider into turn meta (side-effect outside queue — only
            // affects the agent_end snapshot, not rendered messages state).
            if (turnMetaRef.current) {
              if (!turnMetaRef.current.model && event.partial?.model)
                turnMetaRef.current.model = event.partial.model
              if (!turnMetaRef.current.provider && event.partial?.provider)
                turnMetaRef.current.provider = event.partial.provider
            }

            enqueue(
              event.type === "thinking_delta"
                ? { kind: "thinking_delta", delta: event.delta }
                : { kind: "text_delta", delta: event.delta }
            )
          },

          onToolExecutionStart: (data) => {
            if (doneFlag.current) return
            const startTime = Date.now()
            pendingToolStartRef.current.set(data.toolCallId, startTime)
            enqueueNow({
              kind: "tool_start",
              toolCallId: data.toolCallId,
              toolName: data.toolName,
              args: data.args,
              startTime,
            })
          },

          onToolExecutionUpdate: (data) => {
            if (doneFlag.current) return
            enqueue({
              kind: "tool_update",
              toolCallId: data.toolCallId,
              toolName: data.toolName,
              args: data.args,
              partialResult: data.partialResult,
            })
          },

          onToolExecutionEnd: (data) => {
            if (doneFlag.current) return
            const startTime = pendingToolStartRef.current.get(data.toolCallId)
            pendingToolStartRef.current.delete(data.toolCallId)
            enqueue({
              kind: "tool_end",
              toolCallId: data.toolCallId,
              toolName: data.toolName,
              status: data.isError ? "error" : "done",
              result: data.result,
              duration: startTime ? Date.now() - startTime : undefined,
            })
          },

          onAgentEnd: (data) => {
            if (doneFlag.current) return
            agentRunningRef.current = false
            // Snapshot and clear turn meta before flushing so the agent_end
            // event carries the final accumulated model/provider/timing.
            const meta = turnMetaRef.current
            turnMetaRef.current = null
            // Use RAF-batched enqueue (not flushSync) — agent_end has no
            // downstream race; the next startUserPrompt runs through the
            // same queue, so ordering is preserved without forcing a
            // synchronous commit that would block the main thread right
            // when the assistant text is finishing its reveal.
            enqueue({
              kind: "agent_end",
              agentMessages: data.messages ?? [],
              meta,
            })
          },

          onTurnFileChanged: () => {
            if (doneFlag.current) return
            // Skip if a fetch is already in-flight — the response will reflect the latest state.
            if (queryClient.getQueryState(gitKeys.turns(sessionId))?.fetchStatus === "fetching") return
            void queryClient.invalidateQueries({ queryKey: gitKeys.turns(sessionId) })
            void queryClient.invalidateQueries({ queryKey: gitKeys.status(sessionId) })
            void queryClient.invalidateQueries({ queryKey: gitKeys.diffStat(sessionId) })
          },

          onPlanSaved: (data) => {
            if (doneFlag.current) return
            callbacksRef.current.onPlanSaved?.(data)
          },

          onMessageEnd: () => {},
          onTurnStart: () => {},
          onTurnEnd: () => {},
          onQueueUpdate: () => {},

          onAutoRetryStart: ({ attempt, errorMessage }) => {
            if (doneFlag.current) return
            enqueue({ kind: "auto_retry_start", attempt, errorMessage })
          },

          onAutoRetryEnd: ({ success, finalError }) => {
            if (doneFlag.current) return
            enqueue({
              kind: "auto_retry_end",
              success,
              finalError,
              lastPrompt: lastPromptRef.current,
            })
          },

          onCompactionStart: ({ reason }) => {
            if (doneFlag.current) return
            enqueue({ kind: "compaction_start", reason })
          },

          onCompactionEnd: ({ reason, errorMessage, aborted, willRetry }) => {
            if (doneFlag.current) return
            enqueue({ kind: "compaction_end", reason, errorMessage, aborted, willRetry })
          },

          onServerError: ({ message }) => {
            if (doneFlag.current) return
            doneFlag.current = true
            enqueueNow({
              kind: "server_error",
              message,
              lastPrompt: lastPromptRef.current,
            })
          },

          onTransportError: () => {
            if (doneFlag.current) return
            if (!agentRunningRef.current) {
              // Connection dropped while idle (e.g. laptop sleep/wake).
              // Silently reconnect without surfacing an error to the user.
              ws?.close()
              ws = null
              unsubscribe?.()
              unsubscribe = undefined
              reconnectTimer = setTimeout(() => {
                reconnectTimer = null
                if (!doneFlag.current) connect().catch(console.debug)
              }, 2000)
              return
            }
            agentRunningRef.current = false
            doneFlag.current = true
            enqueueNow({
              kind: "transport_error",
              lastPrompt: lastPromptRef.current,
            })
          },
        })
    }

    connect().catch((err) => {
      if (doneFlag.current) return
      doneFlag.current = true
      callbacksRef.current.onIsLoadingChange?.(false)
      console.debug("[session-stream] WebSocket unavailable:", err)
    })

    const handleVisibilityChange = () => {
      if (document.hidden || doneFlag.current) return
      if (!ws || (ws.readyState !== WebSocket.CONNECTING && ws.readyState !== WebSocket.OPEN)) {
        ws = null
        unsubscribe?.()
        unsubscribe = undefined
        if (reconnectTimer === null) connect().catch(console.debug)
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)

    const pendingToolStart = pendingToolStartRef.current
    return () => {
      doneFlag.current = true
      agentRunningRef.current = false
      sessionDoneFlags.delete(sessionId)
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      if (flushTimeoutRef.current !== null) {
        clearTimeout(flushTimeoutRef.current)
        flushTimeoutRef.current = null
      }
      if (reconnectTimer !== null) clearTimeout(reconnectTimer)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      eventQueueRef.current = []
      pendingToolStart.clear()
      unsubscribe?.()
      ws?.close()
    }
  }, [sessionId, enqueue, enqueueNow, queryClient])

  return {
    lastPromptRef,
    pendingThinkingLevelRef,
  }
}
