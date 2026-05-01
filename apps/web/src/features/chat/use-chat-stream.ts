/**
 * Chat stream hook — connects the WebSocket stream to UI state.
 *
 * Responsibilities:
 * - Opens a WebSocket for the session and dispatches events to callbacks
 * - Manages isLoading, isCompacting, pendingError as local state
 * - Provides startUserPrompt() which optimistically adds the user message
 *
 * The isLoading state is scoped to the current sessionId. When sessionId
 * changes (thread switch), the previous session's loading is cleared by the
 * new session's WebSocket opening (which calls onIsLoadingChange(true) via
 * onMessageStart). No explicit session change handling is needed here.
 */
import { useCallback, useState, useMemo } from "react"
import { useQueryClient } from "@tanstack/react-query"

import { useSessionStream } from "./hooks/use-session-stream"
import { useVisibleMessages } from "./hooks/use-visible-messages"
import { messagesQueryKey } from "./queries"
import { dismissSessionError } from "./api"
import { createErrorMessage } from "./types"
import type { ErrorMessage, Message } from "./types"
import { useSetThreadStatus } from "./thread-status-context"

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
  dismissError: (id: string) => void
}

export function useChatStream({
  sessionId,
  threadId,
  initialIsStopped,
}: UseChatStreamOptions): UseChatStreamResult {
  const setThreadStatus = useSetThreadStatus()
  const queryClient = useQueryClient()
  const [isStopped, setIsStopped] = useState(initialIsStopped)
  const [isCompacting, setIsCompacting] = useState(false)
  const [pendingError, setPendingError] = useState<ReturnType<typeof createErrorMessage> | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const { messages } = useVisibleMessages({ sessionId, pendingError })

  const handleError = useCallback(() => {
    setThreadStatus(threadId, "error")
  }, [setThreadStatus, threadId])

  // Connect to WebSocket stream
  const { lastPromptRef, pendingThinkingLevelRef } = useSessionStream({
    sessionId,
    onIsLoadingChange: setIsLoading,
    onIsCompactingChange: setIsCompacting,
    onPendingErrorChange: setPendingError,
    onError: handleError,
  })

  const hasLoadedMessages = messages.length > 0 || isLoading

  const visibleMessages = useMemo(() => messages, [messages])

  const startUserPrompt = useCallback(
    (text: string, thinkingLevel?: string) => {
      setIsStopped(false)
      setIsLoading(true)
      lastPromptRef.current = { text, thinkingLevel }
      pendingThinkingLevelRef.current = thinkingLevel ?? null

      const userMessage: Message = { role: "user", content: text }
      queryClient.setQueryData<Message[]>(messagesQueryKey(sessionId), (prev) => {
        const current = prev ?? []
        const lastMsg = current[current.length - 1]
        // Avoid duplicate if the same message was sent twice quickly
        if (
          current.length > 0 &&
          lastMsg.role === "user" &&
          (lastMsg as Message & { content?: string }).content === text
        ) {
          return current
        }
        return [...current, userMessage]
      })
    },
    [queryClient, sessionId, lastPromptRef, pendingThinkingLevelRef]
  )

  const markStopped = useCallback(() => setIsStopped(true), [])

  const markSendFailed = useCallback(() => {
    // Error handling is managed by the stream hook
  }, [])

  const dismissError = useCallback(
    (id: string) => {
      queryClient.setQueryData<Message[]>(messagesQueryKey(sessionId), (prev) =>
        (prev ?? []).filter(
          (m): boolean => !(m.role === "error" && (m as ErrorMessage).id === id)
        )
      )
      setPendingError((prev) => (prev?.id === id ? null : prev))
      // Tell the server to drop error events from its replay buffer so they
      // don't reappear when the WebSocket reconnects after a page refresh.
      dismissSessionError(sessionId).catch(() => { /* best-effort */ })
    },
    [queryClient, sessionId]
  )

  return {
    visibleMessages,
    hasConversationHistory: visibleMessages.length > 0,
    hasLoadedMessages,
    isLoading,
    isStopped,
    isCompacting,
    startUserPrompt,
    markStopped,
    markSendFailed,
    dismissError,
  }
}
