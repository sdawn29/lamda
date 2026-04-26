import { QueryClient } from "@tanstack/react-query"

import { isServerUnreachableError } from "./client"

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 2 * 60 * 1000,
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Don't retry if server is unreachable (server may be down)
        if (isServerUnreachableError(error)) return false
        // Don't retry on abort errors (requests cancelled intentionally)
        if (error instanceof Error && error.name === "AbortError") return false
        // Only retry once for other errors
        return failureCount < 1
      },
    },
  },
})
