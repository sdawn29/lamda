import { apiFetch } from "@/shared/lib/client"

export interface SemanticSearchHit {
  filePath: string
  startLine: number
  endLine: number
  content: string
  score: number
}

export type SemanticSearchMode = "hybrid" | "fts" | "like" | "none"

export interface SemanticIndexStatus {
  fileCount: number
  chunkCount: number
  embeddedCount: number
  lastIndexedAt: number | null
  lastError: { message: string; occurredAt: number } | null
  vecAvailable: boolean
  embeddingsEnabled: boolean
  enabled: boolean
  injectionEnabled: boolean
  override: "auto" | "on" | "off"
}

export async function searchWorkspaceCode(
  workspaceId: string,
  query: string,
  opts?: { limit?: number; path?: string; signal?: AbortSignal }
): Promise<{ results: SemanticSearchHit[]; mode: SemanticSearchMode }> {
  const params = new URLSearchParams({ q: query })
  if (opts?.limit) params.set("limit", String(opts.limit))
  if (opts?.path) params.set("path", opts.path)
  return apiFetch(
    `/workspace/${workspaceId}/semantic-search?${params.toString()}`,
    { signal: opts?.signal }
  )
}

export async function fetchSemanticIndexStatus(
  workspaceId: string
): Promise<SemanticIndexStatus> {
  return apiFetch(`/workspace/${workspaceId}/semantic-index/status`)
}

export async function triggerSemanticReindex(
  workspaceId: string
): Promise<void> {
  await apiFetch(`/workspace/${workspaceId}/semantic-index/reindex`, {
    method: "POST",
  })
}

export interface SemanticIndexConfigUpdate {
  enabled?: boolean
  injectionEnabled?: boolean
  override?: "auto" | "on" | "off"
}

export async function updateSemanticIndexConfig(
  workspaceId: string,
  update: SemanticIndexConfigUpdate
): Promise<void> {
  await apiFetch(`/workspace/${workspaceId}/semantic-index/config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(update),
  })
}
