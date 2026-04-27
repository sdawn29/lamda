import { useEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useWorkspaces } from "@/features/workspace"
import { messagesQueryKey } from "../queries"
import { listMessages } from "../api"
import { getChatSyncEngine, loadThreadFromStorage } from "./use-chat-sync-engine"
import { blocksToMessages, type MessageBlock } from "../types"
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
 * 
 * Note: This effect uses a ref to track the latest workspaces to avoid
 * restarting prefetches on every render. It handles workspace switches gracefully.
 */
export function usePrefetchThreadsMessages({
  activeThreadId: _unusedActiveThreadId,
}: UsePrefetchThreadsMessagesOptions = {}) {
  void _unusedActiveThreadId
  const { data: workspaces = [] } = useWorkspaces()
  const queryClient = useQueryClient()
  const syncEngine = getChatSyncEngine()
  
  // Track last workspaces to avoid unnecessary effect runs
  const workspacesRef = useRef(workspaces)
  const isInitializedRef = useRef(false)
  
  useEffect(() => {
    // Track if effect should remain active
    let active = true
    
    // Skip if no workspaces
    if (workspaces.length === 0) return
    
    // Mark as initialized after first run
    isInitializedRef.current = true
    workspacesRef.current = workspaces
    
    const currentWorkspaces = workspaces
    
    // Prefetch messages for all threads
    for (const workspace of currentWorkspaces) {
      for (const thread of workspace.threads) {
        if (!thread.sessionId) continue

        const sessionId = thread.sessionId

        // Check if we have local data (instant)
        const localData = loadThreadFromStorage(sessionId)
        if (localData?.messages && localData.messages.length > 0) {
          // We have local data, use it immediately and sync in background
          queryClient.setQueryData(messagesQueryKey(sessionId), localData.messages)
          
          // Sync with server in background (non-blocking)
          // Use active flag to prevent state updates after unmount
          void (async () => {
            try {
              const { blocks } = await listMessages(sessionId)
              // Only update if still active and workspaces haven't changed significantly
              if (!active) return
              
              const serverMessages = blocksToMessages(blocks as MessageBlock[])
              syncEngine.saveMessages(sessionId, serverMessages)
              
              // Only update query cache if sessionId is still relevant
              const currentWs = workspacesRef.current
              const isRelevant = currentWs.some(w => 
                w.threads.some(t => t.sessionId === sessionId)
              )
              if (isRelevant) {
                queryClient.setQueryData(messagesQueryKey(sessionId), serverMessages)
              }
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
            // Check if still relevant
            if (!active) {
              throw new Error("Prefetch cancelled - component unmounted")
            }
            
            const { blocks } = await listMessages(sessionId)
            const messages = blocksToMessages(blocks as MessageBlock[])
            // Save to localStorage for next time
            syncEngine.saveMessages(sessionId, messages)
            return messages
          },
          staleTime: 30 * 60 * 1000,
        })
      }
    }
    
    return () => {
      active = false
    }
  }, [workspaces, queryClient, syncEngine])
}
