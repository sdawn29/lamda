import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  createWorkspace as apiCreateWorkspace,
  deleteWorkspace as apiDeleteWorkspace,
  createThread as apiCreateThread,
  updateThreadTitle as apiUpdateThreadTitle,
  resetAllData,
} from "@/api/workspaces"
import { workspacesQueryKey } from "@/queries/use-workspaces"

export function useCreateWorkspace() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ name, path }: { name: string; path: string }) =>
      apiCreateWorkspace({ name, path }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspacesQueryKey })
    },
  })
}

export function useDeleteWorkspace() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (workspaceId: string) => apiDeleteWorkspace(workspaceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspacesQueryKey })
    },
  })
}

export function useCreateThread() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (workspaceId: string) => apiCreateThread(workspaceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspacesQueryKey })
    },
  })
}

export function useUpdateThreadTitle() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ threadId, title }: { threadId: string; title: string }) =>
      apiUpdateThreadTitle(threadId, title),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspacesQueryKey })
    },
  })
}

export function useResetAll() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => resetAllData(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspacesQueryKey })
    },
  })
}
