import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { fetchTasks, createTask, updateTask, deleteTask } from "./api"
import type { WorkspaceTask } from "./types"

const tasksKey = (workspaceId: string) => ["tasks", workspaceId] as const

export function useTasks(workspaceId: string) {
  return useQuery({
    queryKey: tasksKey(workspaceId),
    queryFn: ({ signal }) => fetchTasks(workspaceId, signal),
    enabled: !!workspaceId,
    staleTime: 60 * 1000,
  })
}

export function useCreateTask(workspaceId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (task: Omit<WorkspaceTask, "id">) => createTask(workspaceId, task),
    onSuccess: () => qc.invalidateQueries({ queryKey: tasksKey(workspaceId) }),
  })
}

export function useUpdateTask(workspaceId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Omit<WorkspaceTask, "id">> }) =>
      updateTask(workspaceId, id, updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: tasksKey(workspaceId) }),
  })
}

export function useDeleteTask(workspaceId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteTask(workspaceId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: tasksKey(workspaceId) }),
  })
}
