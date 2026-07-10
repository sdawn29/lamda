import { useQuery } from "@tanstack/react-query"
import { searchWorkspaceCode, fetchSemanticIndexStatus } from "./api"

const semanticSearchRootKey = ["semantic-search"] as const

export const semanticSearchKeys = {
  all: semanticSearchRootKey,
  search: (workspaceId: string, query: string) =>
    [...semanticSearchRootKey, "search", workspaceId, query] as const,
  status: (workspaceId: string) =>
    [...semanticSearchRootKey, "status", workspaceId] as const,
}

/** Semantic (embedding + keyword) search over a workspace's chunked code. Caller debounces `query`. */
export function useSemanticSearch(
  workspaceId: string | undefined,
  query: string,
  enabled = true
) {
  const trimmed = query.trim()
  return useQuery({
    queryKey: workspaceId
      ? semanticSearchKeys.search(workspaceId, trimmed)
      : (["semantic-search-none"] as const),
    queryFn: ({ signal }) =>
      searchWorkspaceCode(workspaceId!, trimmed, { limit: 12, signal }),
    enabled: enabled && !!workspaceId && trimmed.length >= 3,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })
}

/** Indexing status/stats for a workspace's code index — files/chunks/embedded counts. */
export function useSemanticIndexStatus(
  workspaceId: string | undefined,
  opts?: { poll?: boolean }
) {
  const poll = opts?.poll ?? false
  return useQuery({
    queryKey: workspaceId
      ? semanticSearchKeys.status(workspaceId)
      : (["semantic-index-status-none"] as const),
    queryFn: () => fetchSemanticIndexStatus(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 15_000,
    refetchInterval: poll
      ? (query) => {
          const data = query.state.data
          if (
            data &&
            data.enabled &&
            data.vecAvailable &&
            data.embeddingsEnabled &&
            data.chunkCount > 0 &&
            data.embeddedCount < data.chunkCount
          ) {
            return 2000
          }
          return false
        }
      : undefined,
  })
}
