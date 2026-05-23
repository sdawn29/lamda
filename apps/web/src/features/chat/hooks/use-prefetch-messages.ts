import { useEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useWorkspaces } from "@/features/workspace"
import { messagesQueryKey, MESSAGES_PAGE_SIZE, type MessagesInfiniteData } from "../queries"
import { listMessages } from "../api"
import { getChatSyncEngine, loadThreadFromStorage } from "./use-chat-sync-engine"
import { blocksToMessages, type MessageBlock } from "../types"

function makeInfiniteSeed(messages: ReturnType<typeof blocksToMessages>, hasMore: boolean, oldestBlockIndex: number | null): MessagesInfiniteData {
  return {
    pages: [{ messages, hasMore, oldestBlockIndex }],
    pageParams: [undefined],
  }
}

export function usePrefetchThreadsMessages() {
  const { data: workspaces = [] } = useWorkspaces()
  const queryClient = useQueryClient()
  const syncEngine = getChatSyncEngine()
  const workspacesRef = useRef(workspaces)

  useEffect(() => {
    let active = true
    if (workspaces.length === 0) return
    workspacesRef.current = workspaces

    for (const workspace of workspaces) {
      for (const thread of workspace.threads) {
        if (!thread.sessionId) continue
        const sessionId = thread.sessionId

        // Skip if the cache already has the correct InfiniteData shape.
        const cached = queryClient.getQueryData<MessagesInfiniteData>(messagesQueryKey(sessionId))
        if (cached?.pages) continue

        // Seed from localStorage immediately (no network round-trip).
        const localData = loadThreadFromStorage(sessionId)
        if (localData?.messages?.length) {
          const msgs = localData.messages.slice(-MESSAGES_PAGE_SIZE)
          queryClient.setQueryData(
            messagesQueryKey(sessionId),
            makeInfiniteSeed(msgs, localData.messages.length > MESSAGES_PAGE_SIZE, null)
          )

          // Sync from server in the background so the next mount gets fresh data.
          void (async () => {
            try {
              const { blocks, hasMore } = await listMessages(sessionId, { limit: MESSAGES_PAGE_SIZE })
              if (!active) return
              const serverMessages = blocksToMessages(blocks as MessageBlock[])
              const oldestBlockIndex = blocks.length > 0 ? (blocks[0] as MessageBlock).blockIndex : null
              syncEngine.saveMessages(sessionId, serverMessages)
              const currentWs = workspacesRef.current
              if (currentWs.some((w) => w.threads.some((t) => t.sessionId === sessionId))) {
                queryClient.setQueryData(
                  messagesQueryKey(sessionId),
                  makeInfiniteSeed(serverMessages, hasMore, oldestBlockIndex)
                )
              }
            } catch (e) {
              console.warn("[prefetch] Failed to sync thread:", sessionId, e)
            }
          })()
          continue
        }

        // No local data — prefetch from server.
        void (async () => {
          try {
            if (!active) return
            const { blocks, hasMore } = await listMessages(sessionId, { limit: MESSAGES_PAGE_SIZE })
            if (!active) return
            const messages = blocksToMessages(blocks as MessageBlock[])
            const oldestBlockIndex = blocks.length > 0 ? (blocks[0] as MessageBlock).blockIndex : null
            syncEngine.saveMessages(sessionId, messages)
            queryClient.setQueryData(
              messagesQueryKey(sessionId),
              makeInfiniteSeed(messages, hasMore, oldestBlockIndex)
            )
          } catch (e) {
            console.warn("[prefetch] Failed to fetch thread:", sessionId, e)
          }
        })()
      }
    }

    return () => { active = false }
  }, [workspaces, queryClient, syncEngine])
}
