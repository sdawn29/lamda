/**
 * Simplified chat stream hook - wraps useSessionStream and useVisibleMessages.
 * 
 * This is the main public API for the chat feature. It provides:
 * - SSE connection management via useSessionStream
 * - Message state via useMessages (TanStack Query)
 * - Streaming status (isLoading, isStopped, isCompacting)
 * - Error handling (pending errors)
 */
import { useCallback, useState, useMemo, useRef, useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"

import { useSessionStream } from "./hooks/use-session-stream"
import { useVisibleMessages } from "./hooks/use-visible-messages"
import { messagesQueryKey } from "./queries"
import type { Message } from "./types"
import { createErrorMessage } from "./types"

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

export function useChatStream({
  sessionId,
  threadId,
  initialIsStopped,
}: UseChatStreamOptions): UseChatStreamResult {
  // threadId reserved for future per-thread state
  void threadId

  const queryClient = useQueryClient()
  const [isStopped, setIsStopped] = useState(initialIsStopped)
  const [isCompacting, setIsCompacting] = useState(false)
  const [pendingError, setPendingError] = useState<ReturnType<typeof createErrorMessage> | null>(null)
  const [isLoadingInternal, setIsLoadingInternal] = useState(false)

  const { messages, isLoading } = useVisibleMessages({
    sessionId,
    pendingError,
  })

  // Handle pending error changes from stream
  const handlePendingErrorChange = useCallback(
    (error: ReturnType<typeof createErrorMessage> | null) => {
      setPendingError(error)
    },
    []
  )

  // Connect to SSE stream
  useSessionStream({
    sessionId,
    onIsLoadingChange: setIsLoadingInternal,
    onIsCompactingChange: setIsCompacting,
    onPendingErrorChange: handlePendingErrorChange,
  })

  // Reset loading state when sessionId changes (i.e., when switching threads)
  // This ensures that stale loading states don't persist across threads
  useEffect(() => {
    setIsLoadingInternal(false)
  }, [sessionId])

  const hasLoadedMessages = messages.length > 0 || isLoading

  const visibleMessages = useMemo(() => {
    return messages
  }, [messages])

  // Add user message immediately to cache (optimistic update)
  const startUserPrompt = useCallback(
    (text: string, thinkingLevel?: string) => {
      setIsStopped(false)
      setIsLoadingInternal(true) // Immediately show loading state

      // Optimistically add user message to cache immediately
      const userMessage: Message = { role: "user", content: text }
      queryClient.setQueryData<Message[]>(messagesQueryKey(sessionId), (prev) => {
        const current = prev ?? []
        // Avoid duplicate messages - check if last message is same user message
        const lastMsg = current[current.length - 1]
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
    [queryClient, sessionId]
  )

  const markStopped = useCallback(() => {
    setIsStopped(true)
  }, [])

  const markSendFailed = useCallback(() => {
    // Error handling is managed by the stream hook
  }, [])

  // Track when this thread last reported loading to handle SSE reconnection
  // If isLoadingInternal has been true for too long without being cleared, assume the
  // agent has finished (handles edge cases where agent_end wasn't received)
  const lastLoadingTimeRef = useRef<number | null>(null)

  useEffect(() => {
    if (isLoadingInternal) {
      lastLoadingTimeRef.current = Date.now()
    } else {
      lastLoadingTimeRef.current = null
    }
  }, [isLoadingInternal])

  // Safety: if loading for more than 5 minutes without progress, assume finished
  // This handles edge cases like SSE disconnection without agent_end
  const LOADING_TIMEOUT_MS = 5 * 60 * 1000
  const isTimedOut = lastLoadingTimeRef.current !== null &&
    Date.now() - lastLoadingTimeRef.current > LOADING_TIMEOUT_MS

  // isLoading is true only if this thread's SSE reports loading
  // Each ChatView has its own sessionId, so only the thread with active SSE shows loading
  const isThisThreadLoading = isLoadingInternal && !isTimedOut

  return {
    visibleMessages,
    hasConversationHistory: visibleMessages.length > 0,
    hasLoadedMessages,
    isLoading: isThisThreadLoading,
    isStopped,
    isCompacting,
    startUserPrompt,
    markStopped,
    markSendFailed,
  }
}