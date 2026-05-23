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

  const messages = getMessagesFromInfinite(data)
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
