import { useEffect, useRef, useCallback } from "react"
import { useQueryClient } from "@tanstack/react-query"

import { openSessionWebSocket, listRunningTools } from "../api"
import { subscribeToSessionEvents, type AgentEndMessage } from "../session-events"
import { messagesQueryKey, chatKeys } from "../queries"
import { createAssistantMessage, createErrorMessage, blockToMessage } from "../types"
import type { AssistantMessage, Message, ToolMessage } from "../types"

// ── Helpers ─────────────────────────────────────────────────────────────────────

interface TurnMeta {
  startTime: number
  model?: string
  provider?: string
  thinkingLevel?: string
}

interface AssistantDeltaEvent {
  type: "text_delta" | "thinking_delta"
  delta: string
  partial?: { model?: string; provider?: string }
}

function isAssistantDeltaEvent(
  value: { type: string; delta?: string; partial?: unknown } | undefined
): value is AssistantDeltaEvent {
  return (
    value != null &&
    typeof value.delta === "string" &&
    (value.type === "text_delta" || value.type === "thinking_delta")
  )
}

interface ToolMessageUpdate {
  toolCallId: string
  toolName?: string
  args?: unknown
  status: "running" | "done" | "error"
  result?: unknown
  partialResult?: unknown
  duration?: number
  startTime?: number
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

  const existingIds = new Set(
    messages
      .filter((m): m is ToolMessage => m.role === "tool" && m.status === "running")
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

function appendAssistantDelta(prev: Message[], event: AssistantDeltaEvent): Message[] {
  const last = prev[prev.length - 1]
  if (last?.role !== "assistant") {
    return [
      ...prev,
      event.type === "thinking_delta"
        ? createAssistantMessage({ thinking: event.delta })
        : createAssistantMessage({ content: event.delta }),
    ]
  }
  if (event.type === "thinking_delta") {
    return [...prev.slice(0, -1), { ...last, thinking: last.thinking + event.delta }]
  }
  return [...prev.slice(0, -1), { ...last, content: last.content + event.delta }]
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

function parseErrorMessage(raw: string): string {
  try {
    const parsed = JSON.parse(raw)
    if (parsed?.error?.message) return parsed.error.message
    if (parsed?.error) return typeof parsed.error === "string" ? parsed.error : JSON.stringify(parsed.error)
  } catch {
    const jsonStart = raw.indexOf("{")
    if (jsonStart > 0) {
      try {
        const inner = (JSON.parse(raw.slice(jsonStart)) as Record<string, unknown>)?.error as Record<string, unknown> | undefined
        if (typeof inner?.message === "string") return inner.message
      } catch {
        // fall through to raw string
      }
    }
  }
  return raw
}

// ── Per-session stream state ────────────────────────────────────────────────────

type DoneFlag = { current: boolean }
const sessionDoneFlags = new Map<string, DoneFlag>()

function getSessionDoneFlag(sessionId: string): DoneFlag {
  const existing = sessionDoneFlags.get(sessionId)
  if (existing) return existing
  const flag: DoneFlag = { current: false }
  sessionDoneFlags.set(sessionId, flag)
  return flag
}

// ── Hook ────────────────────────────────────────────────────────────────────────

export interface UseSessionStreamOptions {
  sessionId: string
  onMessageStart?: () => void
  onMessageEnd?: () => void
  onIsLoadingChange?: (loading: boolean) => void
  onIsCompactingChange?: (compacting: boolean) => void
  onPendingErrorChange?: (error: ReturnType<typeof createErrorMessage> | null) => void
}

export function useSessionStream({
  sessionId,
  onMessageStart,
  onMessageEnd,
  onIsLoadingChange,
  onIsCompactingChange,
  onPendingErrorChange,
}: UseSessionStreamOptions) {
  const queryClient = useQueryClient()
  const rafRef = useRef<number | null>(null)
  const pendingDeltasRef = useRef<AssistantDeltaEvent[]>([])
  const pendingToolUpdatesRef = useRef<ToolMessageUpdate[]>([])
  const pendingToolStartRef = useRef<Map<string, number>>(new Map())
  const turnMetaRef = useRef<TurnMeta | null>(null)
  const lastPromptRef = useRef<{ text: string; thinkingLevel?: string } | null>(null)
  const pendingThinkingLevelRef = useRef<string | null>(null)

  // Stable ref to the current callbacks — stored in a ref so event handlers
  // (which are recreated each effect run) always call the latest callbacks.
  const callbacksRef = useRef({ onMessageStart, onIsLoadingChange, onMessageEnd, onIsCompactingChange, onPendingErrorChange })
  useEffect(() => {
    callbacksRef.current = { onMessageStart, onIsLoadingChange, onMessageEnd, onIsCompactingChange, onPendingErrorChange }
  }, [onMessageStart, onIsLoadingChange, onMessageEnd, onIsCompactingChange, onPendingErrorChange])

  const flushPendingUpdates = useCallback(() => {
    rafRef.current = null

    const toolUpdates = pendingToolUpdatesRef.current.splice(0)
    const deltas = pendingDeltasRef.current.splice(0)
    if (toolUpdates.length === 0 && deltas.length === 0) return

    queryClient.setQueryData<Message[]>(messagesQueryKey(sessionId), (prev) => {
      let msgs = prev ?? []

      if (toolUpdates.length > 0) {
        msgs = toolUpdates.reduce((acc, update) => {
          const existing = acc.find(
            (m): m is ToolMessage => m.role === "tool" && m.toolCallId === update.toolCallId
          )
          return upsertToolMessage(acc, update.toolCallId, () => ({
            role: "tool" as const,
            toolCallId: update.toolCallId,
            toolName: update.toolName ?? existing?.toolName ?? "tool",
            args: update.args ?? existing?.args ?? {},
            status: update.status,
            result: update.result ?? existing?.result,
            partialResult: update.partialResult ?? existing?.partialResult,
            duration: update.duration ?? existing?.duration,
            startTime: update.startTime ?? existing?.startTime,
          }))
        }, msgs)
      }

      if (deltas.length > 0) {
        msgs = deltas.reduce((acc, delta) => appendAssistantDelta(acc, delta), msgs)
      }

      return msgs
    })
  }, [queryClient, sessionId])

  const scheduleUpdate = useCallback(() => {
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(flushPendingUpdates)
    }
  }, [flushPendingUpdates])

  // Main WebSocket effect
  useEffect(() => {
    const doneFlag = getSessionDoneFlag(sessionId)
    doneFlag.current = false
    let ws: WebSocket | null = null
    let unsubscribe: (() => void) | undefined

    openSessionWebSocket(sessionId)
      .then((socket) => {
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
            void (async () => {
              try {
                const { runningTools: blocks } = await listRunningTools(sessionId)
                if (blocks.length === 0 || doneFlag.current) return
                const tools = blocks
                  .map(blockToMessage)
                  .filter((msg): msg is ToolMessage => msg.role === "tool" && msg.status === "running")
                if (tools.length > 0 && !doneFlag.current) {
                  callbacksRef.current.onIsLoadingChange?.(true)
                  queryClient.setQueryData<Message[]>(messagesQueryKey(sessionId), (prev) =>
                    mergeRunningTools(prev ?? [], tools)
                  )
                }
              } catch (e) {
                console.warn("[session-stream] Failed to fetch running tools:", e)
              }
            })()
          },

          onMessageStart: (data) => {
            if (doneFlag.current) return
            if (data.message?.role !== "assistant") return
            callbacksRef.current.onMessageStart?.()
            callbacksRef.current.onIsLoadingChange?.(true)
            turnMetaRef.current = {
              startTime: Date.now(),
              thinkingLevel: pendingThinkingLevelRef.current ?? undefined,
            }
            pendingThinkingLevelRef.current = null
            queryClient.setQueryData<Message[]>(messagesQueryKey(sessionId), (prev) => [
              ...(prev ?? []),
              createAssistantMessage(),
            ])
          },

          onMessageUpdate: (data) => {
            if (doneFlag.current) return
            const event = data.assistantMessageEvent
            if (!isAssistantDeltaEvent(event)) return
            if (turnMetaRef.current) {
              if (!turnMetaRef.current.model && event.partial?.model) turnMetaRef.current.model = event.partial.model
              if (!turnMetaRef.current.provider && event.partial?.provider) turnMetaRef.current.provider = event.partial.provider
            }
            pendingDeltasRef.current.push(event)
            scheduleUpdate()
          },

          onToolExecutionStart: (data) => {
            if (doneFlag.current) return
            const startTime = Date.now()
            pendingToolStartRef.current.set(data.toolCallId, startTime)
            pendingToolUpdatesRef.current.push({ toolCallId: data.toolCallId, toolName: data.toolName, args: data.args, status: "running", startTime })
            scheduleUpdate()
          },

          onToolExecutionUpdate: (data) => {
            if (doneFlag.current) return
            pendingToolUpdatesRef.current.push({ toolCallId: data.toolCallId, toolName: data.toolName, args: data.args, status: "running", partialResult: data.partialResult })
            scheduleUpdate()
          },

          onToolExecutionEnd: (data) => {
            if (doneFlag.current) return
            const startTime = pendingToolStartRef.current.get(data.toolCallId)
            pendingToolStartRef.current.delete(data.toolCallId)
            pendingToolUpdatesRef.current.push({
              toolCallId: data.toolCallId,
              toolName: data.toolName,
              status: data.isError ? "error" : "done",
              result: data.result,
              duration: startTime ? Date.now() - startTime : undefined,
            })
            scheduleUpdate()
          },

          onAgentEnd: (data) => {
            if (doneFlag.current) return

            queryClient.setQueryData<Message[]>(messagesQueryKey(sessionId), (prev) => {
              const base = prev ?? []
              let finalized = finalizeRunningTools(base, data.messages ?? [])

              const meta = turnMetaRef.current
              if (meta) {
                const lastIdx = findLastAssistantIndex(finalized)
                if (lastIdx !== -1) {
                  const last = finalized[lastIdx] as AssistantMessage
                  finalized = [
                    ...finalized.slice(0, lastIdx),
                    {
                      ...last,
                      model: meta.model,
                      provider: meta.provider,
                      thinkingLevel: meta.thinkingLevel,
                      responseTime: Date.now() - meta.startTime,
                    },
                    ...finalized.slice(lastIdx + 1),
                  ]
                }
                turnMetaRef.current = null
              }

              const assistantError = [...(data.messages ?? [])]
                .reverse()
                .find(
                  (msg): msg is Extract<AgentEndMessage, { role: "assistant" }> =>
                    msg.role === "assistant" && msg.stopReason === "error" && !!msg.errorMessage
                )

              if (assistantError?.errorMessage) {
                finalized = [
                  ...finalized,
                  createErrorMessage("Error", parseErrorMessage(assistantError.errorMessage)),
                ]
              }

              return finalized
            })

            callbacksRef.current.onMessageEnd?.()
            callbacksRef.current.onIsLoadingChange?.(false)
            void queryClient.invalidateQueries({ queryKey: messagesQueryKey(sessionId) })
            void queryClient.invalidateQueries({ queryKey: chatKeys.contextUsage(sessionId) })
            void queryClient.invalidateQueries({ queryKey: chatKeys.sessionStats(sessionId) })
          },

          onMessageEnd: () => {},
          onTurnStart: () => {},
          onTurnEnd: () => {},
          onQueueUpdate: () => {},

          onAutoRetryStart: ({ attempt, errorMessage }) => {
            if (doneFlag.current) return
            callbacksRef.current.onPendingErrorChange?.(
              createErrorMessage("Retrying", errorMessage, {
                retryable: true,
                retryCount: attempt,
                action: { type: "dismiss" },
              })
            )
          },

          onAutoRetryEnd: ({ success, finalError }) => {
            if (doneFlag.current) return
            if (!success && finalError) {
              const lastPrompt = lastPromptRef.current
              callbacksRef.current.onPendingErrorChange?.(
                createErrorMessage("Retry Failed", finalError, {
                  retryable: true,
                  action: lastPrompt
                    ? { type: "retry", prompt: lastPrompt.text }
                    : { type: "dismiss" },
                })
              )
            } else {
              callbacksRef.current.onPendingErrorChange?.(null)
            }
          },

          onCompactionStart: () => {
            if (doneFlag.current) return
            callbacksRef.current.onIsCompactingChange?.(true)
          },

          onCompactionEnd: ({ errorMessage, aborted }) => {
            if (doneFlag.current) return
            callbacksRef.current.onIsCompactingChange?.(false)
            callbacksRef.current.onPendingErrorChange?.(
              errorMessage && !aborted
                ? createErrorMessage("Compaction Failed", errorMessage)
                : null
            )
          },

          onServerError: ({ message }) => {
            if (doneFlag.current) return
            doneFlag.current = true
            const lastPrompt = lastPromptRef.current
            callbacksRef.current.onPendingErrorChange?.(
              createErrorMessage("Error", message, {
                retryable: true,
                action: lastPrompt
                  ? { type: "retry", prompt: lastPrompt.text }
                  : { type: "dismiss" },
              })
            )
            callbacksRef.current.onIsLoadingChange?.(false)
          },

          onTransportError: () => {
            if (doneFlag.current) return
            doneFlag.current = true
            const lastPrompt = lastPromptRef.current
            callbacksRef.current.onPendingErrorChange?.(
              createErrorMessage(
                "Connection Lost",
                "The connection to the server was lost. Please try again.",
                {
                  action: lastPrompt
                    ? { type: "retry", prompt: lastPrompt.text }
                    : { type: "dismiss" },
                }
              )
            )
            callbacksRef.current.onIsLoadingChange?.(false)
            void queryClient.invalidateQueries({ queryKey: messagesQueryKey(sessionId) })
          },
        })
      })
      .catch((err) => {
        if (doneFlag.current) return
        doneFlag.current = true
        callbacksRef.current.onIsLoadingChange?.(false)
        console.debug("[session-stream] WebSocket unavailable:", err)
      })

    return () => {
      doneFlag.current = true
      sessionDoneFlags.delete(sessionId)
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      pendingDeltasRef.current = []
      pendingToolUpdatesRef.current = []
      unsubscribe?.()
      ws?.close()
    }
  }, [sessionId, queryClient, scheduleUpdate])

  return {
    lastPromptRef,
    pendingThinkingLevelRef,
  }
}
