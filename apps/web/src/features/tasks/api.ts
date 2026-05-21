import { apiFetch } from "@/shared/lib/client"
import type { WorkspaceTask } from "./types"

export async function fetchTasks(workspaceId: string, signal?: AbortSignal): Promise<WorkspaceTask[]> {
  const res = await apiFetch<{ tasks: WorkspaceTask[] }>(
    `/tasks/${encodeURIComponent(workspaceId)}`,
    { signal }
  )
  return res.tasks
}

export async function createTask(
  workspaceId: string,
  task: Omit<WorkspaceTask, "id">
): Promise<WorkspaceTask> {
  const res = await apiFetch<{ task: WorkspaceTask }>(
    `/tasks/${encodeURIComponent(workspaceId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(task),
    }
  )
  return res.task
}

export async function updateTask(
  workspaceId: string,
  id: string,
  updates: Partial<Omit<WorkspaceTask, "id">>
): Promise<void> {
  await apiFetch(`/tasks/${encodeURIComponent(workspaceId)}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  })
}

export async function deleteTask(workspaceId: string, id: string): Promise<void> {
  await apiFetch(`/tasks/${encodeURIComponent(workspaceId)}/${encodeURIComponent(id)}`, {
    method: "DELETE",
  })
}
