import { useEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useWorkspaces } from "@/features/workspace"
import {
  messagesQueryKey,
  MESSAGES_PAGE_SIZE,
  type MessagesInfiniteData,
} from "../queries"
import { listMessages } from "../api"
import { blocksToMessages, type MessageBlock } from "../types"

function makeInfiniteSeed(
  messages: ReturnType<typeof blocksToMessages>,
  hasMore: boolean,
  oldestBlockIndex: number | null
): MessagesInfiniteData {
  return {
    pages: [{ messages, hasMore, oldestBlockIndex }],
    pageParams: [undefined],
  }
}

/**
 * Warm the react-query messages cache for every thread as soon as the
 * workspace list is known, so switching to a thread renders its transcript
 * instantly instead of showing a loading state. The server is local, so this
 * is cheap; there is no client-side persistence layer — the in-memory query
 * cache is the only cache.
 */
export function usePrefetchThreadsMessages() {
  const { data: workspaces = [] } = useWorkspaces()
  const queryClient = useQueryClient()
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
        const cached = queryClient.getQueryData<MessagesInfiniteData>(
          messagesQueryKey(sessionId)
        )
        if (cached?.pages) continue

        void (async () => {
          try {
            const { blocks, hasMore } = await listMessages(sessionId, {
              limit: MESSAGES_PAGE_SIZE,
            })
            if (!active) return
            const messages = blocksToMessages(blocks as MessageBlock[])
            const oldestBlockIndex =
              blocks.length > 0 ? (blocks[0] as MessageBlock).blockIndex : null
            const currentWs = workspacesRef.current
            if (
              currentWs.some((w) =>
                w.threads.some((t) => t.sessionId === sessionId)
              )
            ) {
              // Guard: re-check the cache before writing. If an optimistic message was
              // seeded while this fetch was in-flight (e.g. new-thread-view seeds the
              // user message before navigating), the server response may be empty or
              // stale and must not overwrite the optimistic data.
              const existingCached =
                queryClient.getQueryData<MessagesInfiniteData>(
                  messagesQueryKey(sessionId)
                )
              const existingCount = (existingCached?.pages ?? []).flatMap(
                (p) => p.messages
              ).length
              if (existingCount > messages.length) return
              queryClient.setQueryData(
                messagesQueryKey(sessionId),
                makeInfiniteSeed(messages, hasMore, oldestBlockIndex)
              )
            }
          } catch (e) {
            console.warn("[prefetch] Failed to fetch thread:", sessionId, e)
          }
        })()
      }
    }

    return () => {
      active = false
    }
  }, [workspaces, queryClient])
}
