import { useEffect, useRef, useCallback } from "react"
import { useQueryClient } from "@tanstack/react-query"

import { openSessionWebSocket, listRunningTools } from "../api"
import { subscribeToSessionEvents, type AgentEndMessage } from "../session-events"
import {
  messagesQueryKey,
  chatKeys,
} from "../queries"
import { createAssistantMessage, createErrorMessage, blockToMessage } from "../types"
import type { Message, ToolMessage } from "../types"

interface TurnMeta {
  startTime: number
  model?: string
  provider?: string
  thinkingLevel?: string
  blockId?: string
}

interface AssistantDeltaEvent {
  type: "text_delta" | "thinking_delta"
  delta: string
  partial?: {
    model?: string
    provider?: string
  }
}

function isAssistantDeltaEvent(
  value: { type: string; delta?: string; partial?: unknown } | undefined
): value is AssistantDeltaEvent {
  return Boolean(
    value &&
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
  duration?: number
  startTime?: number
  toolBlockId?: string
}

function upsertToolMessage(
  prev: Message[],
  toolCallId: string,
  updater: (existing?: Message) => Message
): Message[] {
  const index = prev.findIndex(
    (msg) => msg.role === "tool" && msg.toolCallId === toolCallId
  )
  if (index === -1) return [...prev, updater()]
  const next = [...prev]
  next[index] = updater(next[index])
  return next
}

/**
 * Merge running tools into the message list.
 * Running tools from the server are inserted at the correct position
 * (after the assistant message but before any subsequent messages).
 */
function mergeRunningTools(
  messages: Message[],
  runningTools: Message[]
): Message[] {
  if (runningTools.length === 0) return messages
  
  // Filter out any existing running tools with the same toolCallId
  const existingRunningToolIds = new Set(
    messages
      .filter((m): m is ToolMessage => m.role === "tool" && m.status === "running")
      .map((m) => m.toolCallId)
  )
  
  const newRunningTools = runningTools.filter(
    (m): m is ToolMessage => 
      m.role === "tool" && 
      !existingRunningToolIds.has(m.toolCallId)
  )
  
  if (newRunningTools.length === 0) return messages
  
  // Find the position to insert running tools
  // They should appear after the last assistant message and before any user message or final tool
  const lastAssistantIndex = messages.reduceRight(
    (found, msg, i) => found === -1 && msg.role === "assistant" ? i : found,
    -1
  )
  
  if (lastAssistantIndex === -1) {
    // No assistant message yet, append to end
    return [...messages, ...newRunningTools]
  }
  
  // Insert after assistant message, before next message
  const insertIndex = lastAssistantIndex + 1
  return [
    ...messages.slice(0, insertIndex),
    ...newRunningTools,
    ...messages.slice(insertIndex)
  ]
}

function appendAssistantDelta(
  prev: Message[],
  event: AssistantDeltaEvent
): Message[] {
  const next = [...prev]
  const last = next[next.length - 1]
  if (last?.role !== "assistant") {
    next.push(
      event.type === "thinking_delta"
        ? createAssistantMessage({ thinking: event.delta })
        : createAssistantMessage({ content: event.delta })
    )
    return next
  }
  if (event.type === "thinking_delta") {
    next[next.length - 1] = { ...last, thinking: last.thinking + event.delta }
  } else {
    next[next.length - 1] = { ...last, content: last.content + event.delta }
  }
  return next
}

function finalizeRunningTools(
  prev: Message[],
  runMessages: AgentEndMessage[]
): Message[] {
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
        msg.role === "assistant" &&
        (msg.stopReason === "aborted" || msg.stopReason === "error")
    )

  const fallbackError = assistantFailure?.errorMessage
    ? assistantFailure.errorMessage
    : assistantFailure?.stopReason === "aborted"
      ? "Operation aborted"
      : "Tool execution ended without a final result."

  return prev.map((msg) => {
    if (msg.role !== "tool" || msg.status !== "running") return msg
    const toolResult = toolResults.get(msg.toolCallId)
    if (toolResult) {
      const duration = msg.startTime ? Date.now() - msg.startTime : undefined
      return {
        ...msg,
        toolName: toolResult.toolName || msg.toolName,
        status: toolResult.isError ? "error" : "done",
        result: { content: toolResult.content, details: toolResult.details },
        duration: msg.duration ?? duration,
      }
    }
    const duration = msg.startTime ? Date.now() - msg.startTime : undefined
    return {
      ...msg,
      status: "error",
      result: msg.result ?? { content: [{ type: "text", text: fallbackError }] },
      duration: msg.duration ?? duration,
    }
  })
}

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
  const pendingThinkingLevelRef = useRef<string | null>(null)
  const lastPromptRef = useRef<{ text: string; thinkingLevel?: string } | null>(null)

  const flushPendingUpdates = useCallback(() => {
    rafRef.current = null

    // Flush tool starts/updates first
    const toolUpdates = pendingToolUpdatesRef.current
    if (toolUpdates.length > 0) {
      pendingToolUpdatesRef.current = []
      queryClient.setQueryData<Message[]>(
        messagesQueryKey(sessionId),
        (prev) =>
          toolUpdates.reduce(
            (msgs, update) =>
              upsertToolMessage(
                msgs ?? [],
                update.toolCallId,
                (existing) => {
                  // Safely get existing tool properties
                  const existingTool = existing?.role === "tool" 
                    ? existing as ToolMessage 
                    : null
                  
                  return {
                    role: "tool" as const,
                    toolCallId: update.toolCallId,
                    toolName: update.toolName ?? existingTool?.toolName ?? "tool",
                    args: update.args ?? existingTool?.args ?? {},
                    status: update.status,
                    result: update.result ?? existingTool?.result,
                    duration: update.duration ?? existingTool?.duration,
                    startTime: update.startTime ?? existingTool?.startTime,
                  } as ToolMessage
                }
              ),
            prev ?? []
          )
      )
    }

    // Flush deltas
    const deltas = pendingDeltasRef.current
    if (deltas.length > 0) {
      pendingDeltasRef.current = []
      queryClient.setQueryData<Message[]>(
        messagesQueryKey(sessionId),
        (prev) => deltas.reduce((msgs, delta) => appendAssistantDelta(msgs ?? [], delta), prev ?? [])
      )
    }
  }, [queryClient, sessionId])

  const scheduleUpdate = useCallback(() => {
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(flushPendingUpdates)
    }
  }, [flushPendingUpdates])

  // Cleanup on unmount or sessionId change
  useEffect(() => {
    // This effect handles sessionId changes by closing the previous SSE
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [sessionId])

  // Main WebSocket effect
  useEffect(() => {
    let active = true
    let ws: WebSocket | null = null
    // Track the sessionId for this connection to ignore stale events
    const currentSessionId = sessionId

    openSessionWebSocket(sessionId)
      .then((socket) => {
        // socket is null if all retries failed
        if (!socket || !active) {
          if (socket) socket.close()
          return
        }
        ws = socket

        return subscribeToSessionEvents(socket, {
          // Restore running tools on connect
          onAgentStart: () => {
            if (!active || currentSessionId !== sessionId) return
            // Fetch and inject running tools from server on initial connect
            void (async () => {
              try {
                const { runningTools: blocks } = await listRunningTools(sessionId)
                if (blocks.length === 0) return
                
                const tools = blocks
                  .map((block) => blockToMessage(block))
                  .filter((msg): msg is ToolMessage => msg.role === "tool" && msg.status === "running")
                
                if (tools.length > 0) {
                  queryClient.setQueryData<Message[]>(
                    messagesQueryKey(sessionId),
                    (prev) => mergeRunningTools(prev ?? [], tools)
                  )
                }
              } catch (e) {
                console.warn("[session-stream] Failed to fetch running tools:", e)
              }
            })()
          },
          onMessageStart: (data) => {
            if (!active || currentSessionId !== sessionId || data.message?.role !== "assistant") return
            onMessageStart?.()
            onIsLoadingChange?.(true)
            turnMetaRef.current = {
              startTime: Date.now(),
              thinkingLevel: pendingThinkingLevelRef.current ?? undefined,
            }
            pendingThinkingLevelRef.current = null

            // Create assistant message for streaming UI
            queryClient.setQueryData<Message[]>(
              messagesQueryKey(sessionId),
              (prev) => [...(prev ?? []), createAssistantMessage()]
            )
          },
          onMessageUpdate: (data) => {
            if (!active) return
            const event = data.assistantMessageEvent
            if (!isAssistantDeltaEvent(event)) return

            if (turnMetaRef.current) {
              if (!turnMetaRef.current.model && event.partial?.model) {
                turnMetaRef.current.model = event.partial.model
              }
              if (!turnMetaRef.current.provider && event.partial?.provider) {
                turnMetaRef.current.provider = event.partial.provider
              }
            }

            pendingDeltasRef.current.push(event)
            scheduleUpdate()
          },
          onToolExecutionStart: (data) => {
            if (!active) return
            const startTime = Date.now()
            pendingToolStartRef.current.set(data.toolCallId, startTime)
            pendingToolUpdatesRef.current.push({
              toolCallId: data.toolCallId,
              toolName: data.toolName,
              args: data.args,
              status: "running",
              startTime,
            })
            scheduleUpdate()
          },
          onToolExecutionUpdate: (data) => {
            if (!active) return
            pendingToolUpdatesRef.current.push({
              toolCallId: data.toolCallId,
              toolName: data.toolName,
              args: data.args,
              status: "running",
              result: data.partialResult,
            })
            scheduleUpdate()
          },
          onToolExecutionEnd: (data) => {
            if (!active) return
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
            if (!active) return
            const messages = data.messages ?? []

            // Update cache with finalized messages
            queryClient.setQueryData<Message[]>(
              messagesQueryKey(sessionId),
              (prev) => {
                const base = prev ?? []
                let finalized = finalizeRunningTools(base, messages)

                // Add response metadata to last assistant message
                const meta = turnMetaRef.current
                if (meta) {
                  const responseTime = Date.now() - meta.startTime
                  const lastIdx = finalized.reduceRight(
                    (found, msg, i) =>
                      found === -1 && msg.role === "assistant" ? i : found,
                    -1
                  )
                  if (lastIdx !== -1) {
                    const last = finalized[lastIdx]
                    if (last.role === "assistant") {
                      finalized = [
                        ...finalized.slice(0, lastIdx),
                        {
                          ...last,
                          model: meta.model,
                          provider: meta.provider,
                          thinkingLevel: meta.thinkingLevel,
                          responseTime,
                        } as Message,
                        ...finalized.slice(lastIdx + 1),
                      ]
                    }
                  }
                  turnMetaRef.current = null
                }

                // Check for assistant errors
                const assistantError = [...messages]
                  .reverse()
                  .find(
                    (msg): msg is Extract<AgentEndMessage, { role: "assistant" }> =>
                      msg.role === "assistant" && msg.stopReason === "error" && !!msg.errorMessage
                  )

                if (assistantError?.errorMessage) {
                  let displayError = assistantError.errorMessage

                  // Parse error message
                  try {
                    const parsed = JSON.parse(assistantError.errorMessage)
                    if (parsed?.error?.message) {
                      displayError = parsed.error.message
                    } else if (parsed?.error) {
                      displayError =
                        typeof parsed.error === "string"
                          ? parsed.error
                          : JSON.stringify(parsed.error)
                    }
                  } catch {
                    const jsonStart = displayError.indexOf("{")
                    if (jsonStart > 0) {
                      try {
                        const parsed = JSON.parse(
                          displayError.slice(jsonStart)
                        ) as Record<string, unknown>
                        const inner = parsed?.error as
                          | Record<string, unknown>
                          | undefined
                        if (typeof inner?.message === "string") {
                          displayError = inner.message
                        }
                      } catch {
                        // use raw string
                      }
                    }
                  }

                  const errorMsg = createErrorMessage("Error", displayError)
                  finalized = [...finalized, errorMsg]
                }

                return finalized
              }
            )

            onMessageEnd?.()
            onIsLoadingChange?.(false)
            void queryClient.invalidateQueries({ queryKey: messagesQueryKey(sessionId) })
            void queryClient.invalidateQueries({ queryKey: chatKeys.contextUsage(sessionId) })
            void queryClient.invalidateQueries({ queryKey: chatKeys.sessionStats(sessionId) })
          },
          onMessageEnd: () => {},
          onTurnStart: () => {},
          onTurnEnd: () => {},
          onQueueUpdate: () => {},
          onAutoRetryStart: ({ attempt, errorMessage }) => {
            if (!active) return
            onPendingErrorChange?.(
              createErrorMessage("Retrying", errorMessage, {
                retryable: true,
                retryCount: attempt,
                action: { type: "dismiss" },
              })
            )
          },
          onAutoRetryEnd: ({ success, finalError }) => {
            if (!active) return
            if (!success && finalError) {
              const lastPrompt = lastPromptRef.current
              onPendingErrorChange?.(
                createErrorMessage("Retry Failed", finalError, {
                  retryable: true,
                  action: lastPrompt
                    ? { type: "retry", prompt: lastPrompt.text }
                    : { type: "dismiss" },
                })
              )
            } else {
              onPendingErrorChange?.(null)
            }
          },
          onCompactionStart: () => {
            if (!active) return
            onIsCompactingChange?.(true)
          },
          onCompactionEnd: ({ errorMessage, aborted }) => {
            if (!active) return
            onIsCompactingChange?.(false)
            if (errorMessage && !aborted) {
              onPendingErrorChange?.(createErrorMessage("Compaction Failed", errorMessage))
            } else {
              onPendingErrorChange?.(null)
            }
          },
          onServerError: ({ message }) => {
            if (!active) return
            const lastPrompt = lastPromptRef.current
            onPendingErrorChange?.(
              createErrorMessage("Error", message, {
                retryable: true,
                action: lastPrompt
                  ? { type: "retry", prompt: lastPrompt.text }
                  : { type: "dismiss" },
              })
            )
            onIsLoadingChange?.(false)
          },
          onTransportError: () => {
            if (!active || !ws) return

            const lastPrompt = lastPromptRef.current
            onPendingErrorChange?.(
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
            onIsLoadingChange?.(false)
            void queryClient.invalidateQueries({
              queryKey: messagesQueryKey(sessionId),
            })
          },
        })
      })
      .catch((err) => {
        if (active) console.debug("[session-stream] WebSocket unavailable:", err)
      })

    return () => {
      active = false
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
      }
      pendingDeltasRef.current = []
      pendingToolUpdatesRef.current = []
      ws?.close()
      // Reset loading state on cleanup so returning threads don't show stale status
      onIsLoadingChange?.(false)
    }
  }, [
    sessionId,
    queryClient,
    onMessageStart,
    onMessageEnd,
    onIsLoadingChange,
    onIsCompactingChange,
    onPendingErrorChange,
    scheduleUpdate,
  ])

  return {
    lastPromptRef,
    pendingThinkingLevelRef,
  }
}
