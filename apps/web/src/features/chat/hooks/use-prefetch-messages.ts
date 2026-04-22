import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useWorkspaces } from "@/features/workspace"
import { messagesQueryKey, storedToMessage } from "../queries"
import { listMessages } from "../api"
import { getChatSyncEngine, loadThreadFromStorage } from "./use-chat-sync-engine"
import type { Message } from "../types"

interface UsePrefetchThreadsMessagesOptions {
  /** Only prefetch when this thread is active (optional) */
  activeThreadId?: string | null
}

/**
 * Prefetches messages for all threads in the workspace context.
 * 
 * This hook should be used at the app root level to ensure all thread messages
 * are cached (both in TanStack Query and localStorage) when the user views the sidebar,
 * making thread switches instant.
 */
export function usePrefetchThreadsMessages({
  activeThreadId,
}: UsePrefetchThreadsMessagesOptions = {}) {
  const { data: workspaces = [] } = useWorkspaces()
  const queryClient = useQueryClient()
  const syncEngine = getChatSyncEngine()

  useEffect(() => {
    for (const workspace of workspaces) {
      for (const thread of workspace.threads) {
        if (!thread.sessionId) continue

        const sessionId = thread.sessionId

        // Check if we have local data (instant)
        const localData = loadThreadFromStorage(sessionId)
        if (localData?.messages && localData.messages.length > 0) {
          // We have local data, use it immediately and sync in background
          queryClient.setQueryData(messagesQueryKey(sessionId), localData.messages)
          
          // Sync with server in background (non-blocking)
          void (async () => {
            try {
              const { messages: stored } = await listMessages(sessionId)
              const serverMessages = stored.map(storedToMessage)
              syncEngine.saveMessages(sessionId, serverMessages)
              queryClient.setQueryData(messagesQueryKey(sessionId), serverMessages)
            } catch (e) {
              console.warn("[prefetch] Failed to sync thread:", sessionId, e)
            }
          })()
          continue
        }

        // No local data, check query cache
        const cachedData = queryClient.getQueryData<Message[]>(
          messagesQueryKey(sessionId)
        )
        if (cachedData && cachedData.length > 0) {
          continue
        }

        // Start prefetch from server
        void queryClient.prefetchQuery({
          queryKey: messagesQueryKey(sessionId),
          queryFn: async () => {
            const { messages: stored } = await listMessages(sessionId)
            const messages = stored.map(storedToMessage)
            // Save to localStorage for next time
            syncEngine.saveMessages(sessionId, messages)
            return messages
          },
          staleTime: 30 * 60 * 1000,
        })
      }
    }
  }, [workspaces, queryClient, activeThreadId, syncEngine])
}
