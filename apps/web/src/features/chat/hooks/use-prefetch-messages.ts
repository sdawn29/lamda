import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { listMessages } from "../api"
import { messagesQueryKey, storedToMessage } from "../queries"
import type { Workspace } from "@/features/workspace"

interface UsePrefetchMessagesOptions {
  threadId: string
  workspaces: Workspace[]
}

/**
 * Prefetches messages for a thread when the component mounts.
 * This ensures messages are in the cache before the chat view renders,
 * eliminating loading spinners on subsequent visits.
 */
export function usePrefetchMessages({
  threadId,
  workspaces,
}: UsePrefetchMessagesOptions) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!threadId) return

    // Find the thread's session ID
    let sessionId: string | null = null
    for (const ws of workspaces) {
      const thread = ws.threads.find((t) => t.id === threadId)
      if (thread?.sessionId) {
        sessionId = thread.sessionId
        break
      }
    }

    if (!sessionId) return

    // Prefetch messages if not already cached
    void queryClient.prefetchQuery({
      queryKey: messagesQueryKey(sessionId),
      queryFn: async () => {
        const { messages: stored } = await listMessages(sessionId!)
        return stored.map(storedToMessage)
      },
      staleTime: 5 * 60 * 1000,
    })
  }, [threadId, workspaces, queryClient])
}

/**
 * Prefetch messages for a specific session.
 * Call this when navigating to a workspace to warm the cache.
 */
export function prefetchSessionMessages(
  queryClient: ReturnType<typeof useQueryClient>,
  sessionId: string
) {
  void queryClient.prefetchQuery({
    queryKey: messagesQueryKey(sessionId),
    queryFn: async () => {
      const { messages: stored } = await listMessages(sessionId)
      return stored.map(storedToMessage)
    },
    staleTime: 5 * 60 * 1000,
  })
}