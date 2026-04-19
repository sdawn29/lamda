import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"

import { openSessionEventSource } from "./api"
import { messagesQueryKey, useMessages } from "./queries"
import {
  subscribeToSessionEvents,
  type AgentEndMessage,
} from "./session-events"
import { useSetThreadStatus, useThreadStatus } from "./thread-status-context"
import { createAssistantMessage, type AssistantMessage, type Message, type ToolMessage } from "./types"

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
}

function isAssistantDeltaEvent(
  value:
    | {
        type: string
        delta?: string
      }
    | undefined
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
  status: ToolMessage["status"]
  result?: unknown
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
      return {
        ...msg,
        toolName: toolResult.toolName || msg.toolName,
        status: toolResult.isError ? "error" : "done",
        result: {
          content: toolResult.content,
          details: toolResult.details,
        },
      }
    }

    return {
      ...msg,
      status: "error",
      result: msg.result ?? {
        content: [{ type: "text", text: fallbackError }],
      },
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

    for (let index = 0; index < overlap; index += 1) {
      const persistedMessage =
        persistedMessages[persistedMessages.length - overlap + index]
      const currentMessage = currentMessages[index]

      if (!areMessagesEqual(persistedMessage, currentMessage)) {
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
  const initialMessagesRef = useRef<Message[]>(cachedMessages)
  const latestVisibleMessagesRef = useRef<Message[]>(cachedMessages)
  const turnMetaRef = useRef<TurnMeta | null>(null)
  const pendingThinkingLevelRef = useRef<string | null>(null)

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
      initialMessagesRef.current = finalMessages
      latestVisibleMessagesRef.current = finalMessages
      queryClient.setQueryData(messagesQueryKey(sessionId), finalMessages)
      setMessages(null)
      setIsLoading(false)
      setIsCompacting(false)
      invalidatePersistedMessages()
    },
    [invalidatePersistedMessages, queryClient, sessionId]
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
          (found, msg, i) => (found === -1 && msg.role === "assistant" ? i : found),
          -1
        )
        if (lastAssistantIndex !== -1) {
          const last = finalMessages[lastAssistantIndex] as AssistantMessage
          finalMessages = [
            ...finalMessages.slice(0, lastAssistantIndex),
            { ...last, model: meta.model, provider: meta.provider, thinkingLevel: meta.thinkingLevel, responseTime },
            ...finalMessages.slice(lastAssistantIndex + 1),
          ]
        }
        turnMetaRef.current = null
      }

      commitFinalMessages(finalMessages)
    },
    [commitFinalMessages]
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
              if (!turnMetaRef.current.provider && assistantEvent.partial?.provider) {
                turnMetaRef.current.provider = assistantEvent.partial.provider
              }
            }

            applyLocalMessages((prev) =>
              appendAssistantDelta(prev, assistantEvent)
            )
          },
          onToolExecutionStart: (data) => {
            if (!active) return
            applyLocalMessages((prev) =>
              upsertToolExecutionMessage(prev, {
                toolCallId: data.toolCallId,
                toolName: data.toolName,
                args: data.args,
                status: "running",
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
            applyLocalMessages((prev) =>
              upsertToolExecutionMessage(prev, {
                toolCallId: data.toolCallId,
                toolName: data.toolName,
                status: data.isError ? "error" : "done",
                result: data.result,
              })
            )
          },
          onAgentEnd: (data) => {
            if (!active) return
            finishStreamingRun(data.messages ?? [])
          },
          onCompactionStart: () => {
            if (!active) return
            setIsCompacting(true)
          },
          onCompactionEnd: () => {
            if (!active) return
            setIsCompacting(false)
          },
          onSdkError: ({ message }) => {
            if (!active) return
            console.error("[session-events]", message)
            finishStreamingRun([
              {
                role: "assistant",
                stopReason: "error",
                errorMessage: message,
              },
            ])
          },
          onTransportError: () => {
            if (!active || nextEventSource.readyState !== EventSource.CLOSED) {
              return
            }
            console.error("[session-events] connection closed")
            setIsLoading(false)
            setIsCompacting(false)
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
      cleanupListeners?.()
      eventSource?.close()
    }
  }, [
    applyLocalMessages,
    finishStreamingRun,
    invalidatePersistedMessages,
    sessionId,
  ])

  const visibleMessages = useMemo(
    () => messages ?? persistedMessages ?? cachedMessages,
    [cachedMessages, messages, persistedMessages]
  )

  const startUserPrompt = useCallback(
    (text: string, thinkingLevel?: string) => {
      setIsStopped(false)
      setIsLoading(true)
      pendingThinkingLevelRef.current = thinkingLevel ?? null
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
