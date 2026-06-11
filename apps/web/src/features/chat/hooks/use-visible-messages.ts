import { useMemo } from "react"

import { useInfiniteMessages, getMessagesFromInfinite } from "../queries"

export interface UseVisibleMessagesOptions {
  sessionId: string
}

export function useVisibleMessages({ sessionId }: UseVisibleMessagesOptions) {
  const {
    data,
    isLoading,
    isFetching,
    dataUpdatedAt,
    fetchPreviousPage,
    hasPreviousPage,
    isFetchingPreviousPage,
  } = useInfiniteMessages(sessionId)

  // Memoized on the cache object — without this, every render of the consumer
  // re-flattens all pages into a fresh array, which invalidates downstream
  // useMemos (grouping, turn cards, keys) and re-renders every message row on
  // unrelated state changes (scroll button, bar height, timers).
  const messages = useMemo(() => getMessagesFromInfinite(data), [data])
  const isLoadingMessages = isLoading || (!messages.length && isFetching)

  return {
    messages,
    isLoading: isLoadingMessages,
    isFetching,
    dataUpdatedAt,
    fetchPreviousPage,
    hasPreviousPage: hasPreviousPage ?? false,
    isFetchingPreviousPage,
  }
}
