import { useMemo } from "react"
import { useMessages } from "../queries"
import type { ErrorMessage } from "../types"

export interface UseVisibleMessagesOptions {
  sessionId: string
  /** Pending error (retry/compaction banners) from useSessionStream */
  pendingError: ReturnType<typeof import("../types")["createErrorMessage"]> | null
}

/**
 * Combines persisted messages from TanStack Query with session-level errors
 * to produce the final visible messages array.
 * 
 * Error handling strategy:
 * - Session-level errors (from onAgentEnd with stopReason=error) are stored
 *   in the query cache and merged here to survive thread navigation
 * - Pending errors (retry/compaction banners) are transient and shown only
 *   when they have a unique ID not already in the base messages
 */
export function useVisibleMessages({
  sessionId,
  pendingError,
}: UseVisibleMessagesOptions) {
  const { data: persistedMessages = [], isLoading, isFetching } = useMessages(sessionId)

  // Messages are considered loaded once we have data OR we're done fetching
  const hasLoadedMessages = persistedMessages.length > 0 || !isFetching

  const visibleMessages = useMemo(() => {
    // Collect error IDs already in base messages to avoid duplicates
    const baseErrorIds = new Set(
      persistedMessages
        .filter((m): m is ErrorMessage => m.role === "error")
        .map((m) => m.id)
    )

    // Add session-level errors that aren't already in base
    // (these are stored in query cache and survive thread navigation)
    const allMessages = [...persistedMessages]

    // Add pending error if it has a unique ID
    if (pendingError && !baseErrorIds.has(pendingError.id)) {
      allMessages.push(pendingError)
    }

    return allMessages
  }, [persistedMessages, pendingError])

  return {
    messages: visibleMessages,
    isLoading,
    hasLoadedMessages,
  }
}