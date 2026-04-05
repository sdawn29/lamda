import { apiFetch } from "./client"

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

export function createWorkspace(body: {
  name: string
  path: string
  provider?: string
  model?: string
}): Promise<{ workspace: WorkspaceDto }> {
  return apiFetch<{ workspace: WorkspaceDto }>("/workspace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
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
