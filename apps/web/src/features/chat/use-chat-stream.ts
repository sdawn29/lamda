import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"

import { openSessionEventSource } from "./api"
import { messagesQueryKey, useMessages } from "./queries"
import {
  subscribeToSessionEvents,
  type AgentEndMessage,
} from "./session-events"
import { useSetThreadStatus, useThreadStatus } from "./thread-status-context"
import {
  createAssistantMessage,
  createErrorMessage,
  type AssistantMessage,
  type ErrorMessage,
  type Message,
  type ToolMessage,
} from "./types"

// Persists error messages across thread navigation (cleared on page reload)
const sessionClientErrors = new Map<string, ErrorMessage[]>()

interface TurnMeta {
  startTime: number
  model?: string
  provider?: string
  thinkingLevel?: string
}

interface UseChatStreamOptions {
  sessionId: string
  threadId: string
  initialIsStopped: boolean
}

interface UseChatStreamResult {
  visibleMessages: Message[]
  hasConversationHistory: boolean
  hasLoadedMessages: boolean
  isLoading: boolean
  isStopped: boolean
  isCompacting: boolean
  startUserPrompt: (text: string, thinkingLevel?: string) => void
  markStopped: () => void
  markSendFailed: () => void
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
  value:
    | {
        type: string
        delta?: string
        partial?: {
          model?: string
          provider?: string
        }
      }
    | undefined
): value is AssistantDeltaEvent {
  return Boolean(
    value &&
    typeof value.delta === "string" &&
    (value.partial === undefined ||
      (typeof value.partial === "object" &&
        value.partial !== null &&
        (value.partial.model === undefined ||
          typeof value.partial.model === "string") &&
        (value.partial.provider === undefined ||
          typeof value.partial.provider === "string"))) &&
    (value.type === "text_delta" || value.type === "thinking_delta")
  )
}

interface ToolMessageUpdate {
  toolCallId: string
  toolName?: string
  args?: unknown
  status: ToolMessage["status"]
  result?: unknown
  duration?: number
  /** Timestamp (ms) when the tool started — stored on the message so finalizeRunningTools can compute duration */
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

  const next = [...prev]
  next[index] = updater(prev[index] as ToolMessage)
  return next
}

function upsertToolExecutionMessage(
  prev: Message[],
  update: ToolMessageUpdate
): Message[] {
  return upsertToolMessage(prev, update.toolCallId, (existing) => ({
    role: "tool",
    toolCallId: update.toolCallId,
    toolName: update.toolName ?? existing?.toolName ?? "tool",
    args: update.args ?? existing?.args ?? {},
    status: update.status,
    result: update.result ?? existing?.result,
    duration: update.duration ?? existing?.duration,
    startTime: update.startTime ?? existing?.startTime,
  }))
}

function appendAssistantDelta(
  prev: Message[],
  assistantEvent: AssistantDeltaEvent
): Message[] {
  const next = [...prev]
  const last = next[next.length - 1]

  if (last?.role !== "assistant") {
    next.push(
      assistantEvent.type === "thinking_delta"
        ? createAssistantMessage({ thinking: assistantEvent.delta })
        : createAssistantMessage({ content: assistantEvent.delta })
    )
    return next
  }

  next[next.length - 1] =
    assistantEvent.type === "thinking_delta"
      ? {
          ...last,
          thinking: last.thinking + assistantEvent.delta,
        }
      : {
          ...last,
          content: last.content + assistantEvent.delta,
        }

  return next
}

function finalizeRunningTools(
  prev: Message[],
  runMessages: AgentEndMessage[]
): Message[] {
  console.log("[session-events] finalizeRunningTools called with", runMessages.length, "messages")
  console.log("[session-events] runMessages:", JSON.stringify(runMessages, null, 2))

  const toolResults = new Map(
    runMessages
      .filter(
        (
          message
        ): message is Extract<AgentEndMessage, { role: "toolResult" }> =>
          message.role === "toolResult"
      )
      .map((message) => [message.toolCallId, message] as const)
  )

  const assistantFailure = [...runMessages]
    .reverse()
    .find(
      (message): message is Extract<AgentEndMessage, { role: "assistant" }> =>
        message.role === "assistant" &&
        (message.stopReason === "aborted" || message.stopReason === "error")
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
      const duration =
        msg.startTime !== undefined
          ? Date.now() - msg.startTime
          : undefined
      return {
        ...msg,
        toolName: toolResult.toolName || msg.toolName,
        status: toolResult.isError ? "error" : "done",
        result: {
          content: toolResult.content,
          details: toolResult.details,
        },
        duration: msg.duration ?? duration,
      }
    }

    const duration =
      msg.startTime !== undefined
        ? Date.now() - msg.startTime
        : undefined
    return {
      ...msg,
      status: "error",
      result: msg.result ?? {
        content: [{ type: "text", text: fallbackError }],
      },
      duration: msg.duration ?? duration,
    }
  })
}

function resolveMessages(
  prev: Message[] | null,
  initialMessages: Message[]
): Message[] {
  return prev ?? initialMessages
}

function areMessagesEqual(left: Message, right: Message): boolean {
  if (left.role === "user" && right.role === "user") {
    return left.content === right.content
  }

  if (left.role === "assistant" && right.role === "assistant") {
    return left.content === right.content && left.thinking === right.thinking
  }

  if (left.role === "tool" && right.role === "tool") {
    return (
      left.toolCallId === right.toolCallId &&
      left.toolName === right.toolName &&
      left.status === right.status &&
      JSON.stringify(left.args) === JSON.stringify(right.args) &&
      JSON.stringify(left.result) === JSON.stringify(right.result)
    )
  }

  if (left.role === "error" && right.role === "error") {
    return left.id === right.id
  }

  return false
}

function haveSameMessages(left: Message[], right: Message[]): boolean {
  if (left.length !== right.length) return false

  return left.every((message, index) => areMessagesEqual(message, right[index]))
}

function getMessageOverlapLength(
  persistedMessages: Message[],
  currentMessages: Message[]
): number {
  const maxOverlap = Math.min(persistedMessages.length, currentMessages.length)

  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    let matches = true

    // Compare the last `overlap` messages of persisted with the first
    // `overlap` messages of current (suffix-to-prefix match).
    // Start from the end of persisted so we short-circuit early on large
    // overlaps.
    for (let offset = overlap - 1; offset >= 0; offset -= 1) {
      const pIdx = persistedMessages.length - 1 - offset
      const currentMessage = currentMessages[offset]

      if (!areMessagesEqual(persistedMessages[pIdx], currentMessage)) {
        matches = false
        break
      }
    }

    if (matches) {
      return overlap
    }
  }

  return 0
}

function mergePersistedMessages(
  persistedMessages: Message[],
  currentMessages: Message[]
): Message[] {
  if (persistedMessages.length === 0) return currentMessages
  if (currentMessages.length === 0) return persistedMessages

  const overlap = getMessageOverlapLength(persistedMessages, currentMessages)

  return [...persistedMessages, ...currentMessages.slice(overlap)]
}

export function useChatStream({
  sessionId,
  threadId,
  initialIsStopped,
}: UseChatStreamOptions): UseChatStreamResult {
  const queryClient = useQueryClient()
  const setThreadStatus = useSetThreadStatus()
  const persistedThreadStatus = useThreadStatus(threadId)
  const { data: persistedMessages } = useMessages(sessionId)
  const cachedMessages = useMemo(
    () =>
      queryClient.getQueryData<Message[]>(messagesQueryKey(sessionId)) ?? [],
    [queryClient, sessionId]
  )
  const [messages, setMessages] = useState<Message[] | null>(null)
  const [isLoading, setIsLoading] = useState(
    persistedThreadStatus === "running"
  )
  const [isStopped, setIsStopped] = useState(initialIsStopped)
  const [isCompacting, setIsCompacting] = useState(false)
  const [pendingError, setPendingError] = useState<ErrorMessage | null>(null)
  const autoRetryCountRef = useRef(0)
  const initialMessagesRef = useRef<Message[]>(cachedMessages)
  const latestVisibleMessagesRef = useRef<Message[]>(cachedMessages)
  const turnMetaRef = useRef<TurnMeta | null>(null)
  const pendingThinkingLevelRef = useRef<string | null>(null)
  const pendingDeltasRef = useRef<AssistantDeltaEvent[]>([])
  const rafRef = useRef<number | null>(null)
  // Track last prompt for retry functionality
  const lastPromptRef = useRef<{ text: string; thinkingLevel?: string } | null>(null)
  // Track tool execution start times for duration display
  const toolStartTimesRef = useRef<Map<string, number>>(new Map())

  const applyLocalMessages = useCallback(
    (updater: (currentMessages: Message[]) => Message[]) => {
      setMessages((prev) => {
        const next = updater(resolveMessages(prev, initialMessagesRef.current))
        latestVisibleMessagesRef.current = next
        return next
      })
    },
    []
  )

  const invalidatePersistedMessages = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: messagesQueryKey(sessionId),
    })
  }, [queryClient, sessionId])

  const commitFinalMessages = useCallback(
    (finalMessages: Message[]) => {
      if (pendingError) {
        finalMessages = [...finalMessages, pendingError]
        setPendingError(null)
      }
      initialMessagesRef.current = finalMessages
      latestVisibleMessagesRef.current = finalMessages
      queryClient.setQueryData(messagesQueryKey(sessionId), finalMessages)
      setMessages(null)
      setIsLoading(false)
      setIsCompacting(false)
      invalidatePersistedMessages()
    },
    [invalidatePersistedMessages, queryClient, sessionId, pendingError]
  )

  const finishStreamingRun = useCallback(
    (runMessages: AgentEndMessage[]) => {
      let finalMessages = finalizeRunningTools(
        latestVisibleMessagesRef.current,
        runMessages
      )

      const meta = turnMetaRef.current
      if (meta) {
        const responseTime = Date.now() - meta.startTime
        const lastAssistantIndex = finalMessages.reduceRight(
          (found, msg, i) =>
            found === -1 && msg.role === "assistant" ? i : found,
          -1
        )
        if (lastAssistantIndex !== -1) {
          const last = finalMessages[lastAssistantIndex] as AssistantMessage
          finalMessages = [
            ...finalMessages.slice(0, lastAssistantIndex),
            {
              ...last,
              model: meta.model,
              provider: meta.provider,
              thinkingLevel: meta.thinkingLevel,
              responseTime,
            },
            ...finalMessages.slice(lastAssistantIndex + 1),
          ]
        }
        turnMetaRef.current = null
      }

      const assistantError = [...runMessages]
        .reverse()
        .find(
          (msg): msg is Extract<AgentEndMessage, { role: "assistant" }> =>
            msg.role === "assistant" &&
            msg.stopReason === "error" &&
            !!msg.errorMessage
        )

      if (assistantError?.errorMessage) {
        let displayError = assistantError.errorMessage

        // Try to parse if it's a JSON string containing an API error
        try {
          const parsed = JSON.parse(assistantError.errorMessage)
          if (parsed?.error?.message) {
            displayError = parsed.error.message
          } else if (parsed?.error) {
            displayError = typeof parsed.error === 'string' ? parsed.error : JSON.stringify(parsed.error)
          }
        } catch {
          // Not JSON — try stripping a leading HTTP status code ("500 {...}")
          const jsonStart = displayError.indexOf("{")
          if (jsonStart > 0) {
            try {
              const parsed = JSON.parse(displayError.slice(jsonStart)) as Record<string, unknown>
              const inner = parsed?.error as Record<string, unknown> | undefined
              if (typeof inner?.message === "string") {
                displayError = inner.message
              }
            } catch {
              // use raw string as-is
            }
          }
        }

        const errorMsg = createErrorMessage("Error", displayError)
        // Persist in module-level Map so the error survives thread navigation
        sessionClientErrors.set(sessionId, [
          ...(sessionClientErrors.get(sessionId) ?? []),
          errorMsg,
        ])
        finalMessages = [...finalMessages, errorMsg]
      }

      commitFinalMessages(finalMessages)
    },
    [commitFinalMessages, sessionId]
  )

  useEffect(() => {
    setThreadStatus(threadId, isLoading ? "running" : "idle")
  }, [threadId, isLoading, setThreadStatus])

  useEffect(() => {
    if (persistedMessages === undefined) return

    initialMessagesRef.current = persistedMessages
    setMessages((prev) => {
      if (prev === null) return prev

      const mergedMessages = mergePersistedMessages(persistedMessages, prev)
      latestVisibleMessagesRef.current = mergedMessages

      return haveSameMessages(prev, mergedMessages) ? prev : mergedMessages
    })
  }, [persistedMessages])

  useEffect(() => {
    if (messages !== null) return
    latestVisibleMessagesRef.current = persistedMessages ?? cachedMessages
  }, [cachedMessages, messages, persistedMessages])

  useEffect(() => {
    let active = true
    let eventSource: EventSource | null = null
    let cleanupListeners: (() => void) | null = null

    openSessionEventSource(sessionId)
      .then((nextEventSource) => {
        if (!active) {
          nextEventSource.close()
          return
        }

        eventSource = nextEventSource
        cleanupListeners = subscribeToSessionEvents(nextEventSource, {
          onMessageStart: (data) => {
            if (!active || data.message?.role !== "assistant") return
            setIsLoading(true)
            setIsStopped(false)
            turnMetaRef.current = {
              startTime: Date.now(),
              thinkingLevel: pendingThinkingLevelRef.current ?? undefined,
            }
            pendingThinkingLevelRef.current = null
            applyLocalMessages((prev) => [...prev, createAssistantMessage()])
          },
          onMessageUpdate: (data) => {
            if (!active) return

            const assistantEvent = data.assistantMessageEvent
            if (!isAssistantDeltaEvent(assistantEvent)) {
              return
            }

            if (turnMetaRef.current) {
              if (!turnMetaRef.current.model && assistantEvent.partial?.model) {
                turnMetaRef.current.model = assistantEvent.partial.model
              }
              if (
                !turnMetaRef.current.provider &&
                assistantEvent.partial?.provider
              ) {
                turnMetaRef.current.provider = assistantEvent.partial.provider
              }
            }

            pendingDeltasRef.current.push(assistantEvent)
            if (rafRef.current === null) {
              rafRef.current = requestAnimationFrame(() => {
                rafRef.current = null
                const deltas = pendingDeltasRef.current
                if (deltas.length === 0) return
                pendingDeltasRef.current = []
                applyLocalMessages((prev) =>
                  deltas.reduce(
                    (msgs, delta) => appendAssistantDelta(msgs, delta),
                    prev
                  )
                )
              })
            }
          },
          onToolExecutionStart: (data) => {
            if (!active) return
            const startTime = Date.now()
            toolStartTimesRef.current.set(data.toolCallId, startTime)
            applyLocalMessages((prev) =>
              upsertToolExecutionMessage(prev, {
                toolCallId: data.toolCallId,
                toolName: data.toolName,
                args: data.args,
                status: "running",
                startTime,
              })
            )
          },
          onToolExecutionUpdate: (data) => {
            if (!active) return
            applyLocalMessages((prev) =>
              upsertToolExecutionMessage(prev, {
                toolCallId: data.toolCallId,
                toolName: data.toolName,
                args: data.args,
                status: "running",
                result: data.partialResult,
              })
            )
          },
          onToolExecutionEnd: (data) => {
            if (!active) return
            const startTime = toolStartTimesRef.current.get(data.toolCallId)
            const duration =
              startTime !== undefined ? Date.now() - startTime : undefined
            toolStartTimesRef.current.delete(data.toolCallId)
            applyLocalMessages((prev) =>
              upsertToolExecutionMessage(prev, {
                toolCallId: data.toolCallId,
                toolName: data.toolName,
                status: data.isError ? "error" : "done",
                result: data.result,
                duration,
              })
            )
          },
          onAgentEnd: (data) => {
            if (!active) return
            console.log("[session-events] agent_end received, messages:", JSON.stringify(data.messages, null, 2))
            finishStreamingRun(data.messages ?? [])
          },
          onMessageEnd: () => {
            // informational - message completed
          },
          onTurnStart: () => {
            // informational - turn started
          },
          onTurnEnd: () => {
            // informational - turn ended
          },
          onAgentStart: () => {
            // informational - agent started
          },
          onQueueUpdate: () => {
            // informational - queue updated
          },
          onAutoRetryStart: ({ attempt, errorMessage }) => {
            if (!active) return
            autoRetryCountRef.current = attempt
            setPendingError(
              createErrorMessage(
                "Retrying",
                errorMessage,
                {
                  retryable: true,
                  retryCount: attempt,
                  action: { type: "dismiss" },
                }
              )
            )
          },
          onAutoRetryEnd: ({ success, finalError }) => {
            if (!active) return
            autoRetryCountRef.current = 0
            if (!success && finalError) {
              const lastPrompt = lastPromptRef.current
              setPendingError(
                createErrorMessage("Retry Failed", finalError, {
                  retryable: true,
                  action: lastPrompt ? { type: "retry", prompt: lastPrompt.text } : { type: "dismiss" },
                })
              )
            } else {
              setPendingError(null)
            }
          },
          onCompactionStart: () => {
            if (!active) return
            setIsCompacting(true)
          },
          onCompactionEnd: ({ errorMessage, aborted }) => {
            if (!active) return
            setIsCompacting(false)
            if (errorMessage && !aborted) {
              setPendingError(
                createErrorMessage("Compaction Failed", errorMessage)
              )
            } else {
              setPendingError(null)
            }
          },
          onServerError: ({ message }) => {
            if (!active) return
            console.error("[session-events] server_error:", message)
            finishStreamingRun([
              {
                role: "assistant",
                stopReason: "error",
                errorMessage: message,
              },
            ])
            // Add retry action to the last message after streaming finishes
            const lastPrompt = lastPromptRef.current
            setPendingError(
              createErrorMessage("Error", message, {
                retryable: true,
                action: lastPrompt ? { type: "retry", prompt: lastPrompt.text } : { type: "dismiss" },
              })
            )
          },
          onTransportError: () => {
            if (!active || nextEventSource.readyState !== EventSource.CLOSED) {
              return
            }
            console.error("[session-events] connection closed")
            setIsLoading(false)
            setIsCompacting(false)
            const lastPrompt = lastPromptRef.current
            setPendingError(
              createErrorMessage("Connection Lost", "The connection to the server was lost. Please try again.", {
                action: lastPrompt ? { type: "retry", prompt: lastPrompt.text } : { type: "dismiss" },
              })
            )
            invalidatePersistedMessages()
          },
        })
      })
      .catch((error: unknown) => {
        if (active) {
          console.error("[session-events]", error)
        }
      })

    return () => {
      active = false
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      pendingDeltasRef.current = []
      cleanupListeners?.()
      eventSource?.close()
    }
  }, [
    applyLocalMessages,
    finishStreamingRun,
    invalidatePersistedMessages,
    sessionId,
  ])

  const visibleMessages = useMemo(() => {
    const base = messages ?? persistedMessages ?? cachedMessages
    const stored = sessionClientErrors.get(sessionId) ?? []

    // Collect error IDs already in base to avoid duplicates
    const baseErrorIds = new Set(
      base.filter((m): m is ErrorMessage => m.role === "error").map((m) => m.id)
    )

    // Session-level errors not yet in base
    const sessionErrors = stored.filter((e) => !baseErrorIds.has(e.id))

    // Pending error (retry/compaction banners) not yet in base
    const pending = pendingError && !baseErrorIds.has(pendingError.id)
      ? [pendingError]
      : []

    if (sessionErrors.length === 0 && pending.length === 0) return base
    return [...base, ...sessionErrors, ...pending]
  }, [cachedMessages, messages, persistedMessages, sessionId, pendingError])

  const startUserPrompt = useCallback(
    (text: string, thinkingLevel?: string) => {
      setIsStopped(false)
      setIsLoading(true)
      pendingThinkingLevelRef.current = thinkingLevel ?? null
      lastPromptRef.current = { text, thinkingLevel }
      applyLocalMessages((prev) => [...prev, { role: "user", content: text }])
    },
    [applyLocalMessages]
  )

  const markStopped = useCallback(() => {
    setIsLoading(false)
    setIsStopped(true)
  }, [])

  const markSendFailed = useCallback(() => {
    setIsLoading(false)
  }, [])

  return {
    visibleMessages,
    hasConversationHistory: visibleMessages.length > 0,
    hasLoadedMessages:
      persistedMessages !== undefined || cachedMessages.length > 0,
    isLoading,
    isStopped,
    isCompacting,
    startUserPrompt,
    markStopped,
    markSendFailed,
  }
}
