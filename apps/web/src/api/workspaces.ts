import { apiFetch, getServerUrl } from "./client"

export interface ThreadDto {
  id: string
  workspaceId: string
  title: string
  createdAt: number
  sessionId: string | null
}

export interface WorkspaceDto {
  id: string
  name: string
  path: string
  createdAt: number
  threads: ThreadDto[]
}

export function listWorkspaces(): Promise<{ workspaces: WorkspaceDto[] }> {
  return apiFetch<{ workspaces: WorkspaceDto[] }>("/workspaces")
}

export async function createWorkspace(body: {
  name: string
  path: string
  provider?: string
  model?: string
}): Promise<{ workspace: WorkspaceDto; existing?: true }> {
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

export function createThread(workspaceId: string): Promise<{ thread: ThreadDto }> {
  return apiFetch<{ thread: ThreadDto }>(`/workspace/${workspaceId}/thread`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  })
}

export function deleteThread(threadId: string): Promise<void> {
  return apiFetch<void>(`/thread/${threadId}`, { method: "DELETE" })
}

export function updateThreadTitle(threadId: string, title: string): Promise<void> {
  return apiFetch<void>(`/thread/${threadId}/title`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  })
}

export interface StoredMessageDto {
  id: string
  threadId: string
  role: "user" | "assistant" | "tool"
  content: string
  createdAt: number
}

export function listMessages(sessionId: string): Promise<{ messages: StoredMessageDto[] }> {
  return apiFetch<{ messages: StoredMessageDto[] }>(`/session/${sessionId}/messages`)
}

export function resetAllData(): Promise<void> {
  return apiFetch<void>("/reset", { method: "DELETE" })
}
