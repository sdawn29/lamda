import { apiFetch, getServerUrl } from "@/shared/lib/client"

export interface CreateWorkspaceBody {
  name: string
  path: string
  provider?: string
  model?: string
}

export interface ThreadDto {
  id: string
  workspaceId: string
  title: string
  modelId: string | null
  isStopped: boolean
  createdAt: number
  sessionId: string | null
  isPinned?: boolean
}

export interface WorkspaceDto {
  id: string
  name: string
  path: string
  openWithAppId: string | null
  createdAt: number
  threads: ThreadDto[]
}

export function listWorkspaces(): Promise<{ workspaces: WorkspaceDto[] }> {
  return apiFetch<{ workspaces: WorkspaceDto[] }>("/workspaces")
}

export async function createWorkspace(
  body: CreateWorkspaceBody
): Promise<{ workspace: WorkspaceDto; existing?: true }> {
  const base = await getServerUrl()
  const res = await fetch(`${base}/workspace`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (res.status === 409) {
    const data = (await res.json()) as { workspace: WorkspaceDto }
    return { workspace: data.workspace, existing: true }
  }
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`API ${res.status}: ${text}`)
  }
  return res.json() as Promise<{ workspace: WorkspaceDto }>
}

export function deleteWorkspace(id: string): Promise<void> {
  return apiFetch<void>(`/workspace/${id}`, { method: "DELETE" })
}

export function updateWorkspaceOpenWithApp(
  id: string,
  appId: string | null
): Promise<void> {
  return apiFetch<void>(`/workspace/${id}/open-with-app`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ appId }),
  })
}

export function createThread(
  workspaceId: string
): Promise<{ thread: ThreadDto }> {
  return apiFetch<{ thread: ThreadDto }>(`/workspace/${workspaceId}/thread`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  })
}

export function deleteThread(threadId: string): Promise<void> {
  return apiFetch<void>(`/thread/${threadId}`, { method: "DELETE" })
}

export function updateThreadTitle(
  threadId: string,
  title: string
): Promise<void> {
  return apiFetch<void>(`/thread/${threadId}/title`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  })
}

export function updateThreadModel(
  threadId: string,
  modelId: string | null
): Promise<void> {
  return apiFetch<void>(`/thread/${threadId}/model`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ modelId }),
  })
}

export function updateThreadStopped(
  threadId: string,
  stopped: boolean
): Promise<void> {
  return apiFetch<void>(`/thread/${threadId}/stopped`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stopped }),
  })
}

export function updateThreadLastAccessed(threadId: string): Promise<void> {
  return apiFetch<void>(`/thread/${threadId}/last-accessed`, {
    method: "PATCH",
  })
}

export function archiveThread(threadId: string): Promise<void> {
  return apiFetch<void>(`/thread/${threadId}/archive`, { method: "PATCH" })
}

export function unarchiveThread(threadId: string): Promise<void> {
  return apiFetch<void>(`/thread/${threadId}/unarchive`, { method: "PATCH" })
}

export function pinThread(threadId: string): Promise<void> {
  return apiFetch<void>(`/thread/${threadId}/pin`, { method: "PATCH" })
}

export function unpinThread(threadId: string): Promise<void> {
  return apiFetch<void>(`/thread/${threadId}/unpin`, { method: "PATCH" })
}

export interface ArchivedThreadDto {
  id: string
  workspaceId: string
  workspaceName: string
  workspacePath: string
  title: string
  modelId: string | null
  createdAt: number
}

export function listArchivedThreads(): Promise<{ threads: ArchivedThreadDto[] }> {
  return apiFetch<{ threads: ArchivedThreadDto[] }>("/threads/archived")
}

export function resetAllData(): Promise<void> {
  return apiFetch<void>("/reset", { method: "DELETE" })
}

export interface WorkspaceFileEntry {
  relativePath: string
  name: string
  isDirectory: boolean
}

export function listWorkspaceIndexFiles(
  workspaceId: string
): Promise<{ files: WorkspaceFileEntry[] }> {
  return apiFetch<{ files: WorkspaceFileEntry[] }>(`/workspace/${workspaceId}/files`)
}

export function triggerWorkspaceReindex(workspaceId: string): Promise<void> {
  return apiFetch<void>(`/workspace/${workspaceId}/reindex`, { method: "POST" })
}
