import {
  type QueryClient,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"
import {
  createWorkspace as apiCreateWorkspace,
  type CreateWorkspaceBody,
  deleteWorkspace as apiDeleteWorkspace,
  updateWorkspaceOpenWithApp as apiUpdateWorkspaceOpenWithApp,
  createThread as apiCreateThread,
  deleteThread as apiDeleteThread,
  archiveThread as apiArchiveThread,
  unarchiveThread as apiUnarchiveThread,
  pinThread as apiPinThread,
  unpinThread as apiUnpinThread,
  updateThreadTitle as apiUpdateThreadTitle,
  updateThreadModel as apiUpdateThreadModel,
  updateThreadStopped as apiUpdateThreadStopped,
  updateThreadLastAccessed as apiUpdateThreadLastAccessed,
  resetAllData,
  type WorkspaceDto,
} from "./api"
import { workspacesQueryKey } from "./queries"
import {
  createSession,
  deleteSession,
  type CreateSessionBody,
} from "@/features/chat/api"
import { chatKeys } from "@/features/chat/queries"
import { gitKeys } from "@/features/git/queries"

function setWorkspacesData(
  queryClient: QueryClient,
  updater: (workspaces: WorkspaceDto[]) => WorkspaceDto[]
) {
  queryClient.setQueryData<WorkspaceDto[]>(workspacesQueryKey, (current) =>
    updater(current ?? [])
  )
}

function removeSessionQueries(
  queryClient: QueryClient,
  sessionIds: Array<string | null | undefined>
) {
  for (const sessionId of sessionIds) {
    if (!sessionId) continue
    queryClient.removeQueries({ queryKey: chatKeys.session(sessionId) })
    queryClient.removeQueries({ queryKey: gitKeys.session(sessionId) })
  }
}

function upsertWorkspace(
  workspaces: WorkspaceDto[],
  workspace: WorkspaceDto
): WorkspaceDto[] {
  const existingIndex = workspaces.findIndex((item) => item.id === workspace.id)
  if (existingIndex === -1) {
    return [...workspaces, workspace]
  }

  const next = [...workspaces]
  next[existingIndex] = workspace
  return next
}

export function useCreateWorkspace() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateWorkspaceBody) => apiCreateWorkspace(body),
    onSuccess: ({ workspace }) => {
      setWorkspacesData(queryClient, (current) =>
        upsertWorkspace(current, workspace)
      )
      queryClient.invalidateQueries({ queryKey: workspacesQueryKey })
    },
  })
}

export function useDeleteWorkspace() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (workspace: WorkspaceDto) => apiDeleteWorkspace(workspace.id),
    onSuccess: (_data, workspace) => {
      setWorkspacesData(queryClient, (current) =>
        current.filter((item) => item.id !== workspace.id)
      )
      removeSessionQueries(
        queryClient,
        workspace.threads.map((thread) => thread.sessionId)
      )
      queryClient.invalidateQueries({ queryKey: workspacesQueryKey })
    },
  })
}

export function useCreateThread() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (workspaceId: string) => apiCreateThread(workspaceId),
    onSuccess: ({ thread }, workspaceId) => {
      setWorkspacesData(queryClient, (current) =>
        current.map((workspace) =>
          workspace.id !== workspaceId
            ? workspace
            : {
                ...workspace,
                threads: workspace.threads.some((item) => item.id === thread.id)
                  ? workspace.threads
                  : [...workspace.threads, thread],
              }
        )
      )
      queryClient.invalidateQueries({ queryKey: workspacesQueryKey })
    },
  })
}

export function useDeleteThread() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ threadId }: { workspaceId: string; threadId: string }) =>
      apiDeleteThread(threadId),
    onSuccess: (_data, { workspaceId, threadId }) => {
      const current =
        queryClient.getQueryData<WorkspaceDto[]>(workspacesQueryKey) ?? []
      const deletedThread = current
        .find((workspace) => workspace.id === workspaceId)
        ?.threads.find((thread) => thread.id === threadId)

      setWorkspacesData(queryClient, (workspaces) =>
        workspaces.map((workspace) =>
          workspace.id !== workspaceId
            ? workspace
            : {
                ...workspace,
                threads: workspace.threads.filter(
                  (thread) => thread.id !== threadId
                ),
              }
        )
      )

      removeSessionQueries(queryClient, [deletedThread?.sessionId])
      queryClient.invalidateQueries({ queryKey: workspacesQueryKey })
    },
  })
}

export function useUpdateThreadTitle() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      threadId,
      title,
    }: {
      workspaceId: string
      threadId: string
      title: string
    }) => apiUpdateThreadTitle(threadId, title),
    onMutate: ({ workspaceId, threadId, title }) => {
      const previous =
        queryClient.getQueryData<WorkspaceDto[]>(workspacesQueryKey)
      setWorkspacesData(queryClient, (workspaces) =>
        workspaces.map((workspace) =>
          workspace.id !== workspaceId
            ? workspace
            : {
                ...workspace,
                threads: workspace.threads.map((thread) =>
                  thread.id === threadId ? { ...thread, title } : thread
                ),
              }
        )
      )

      return { previous }
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(workspacesQueryKey, context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: workspacesQueryKey })
    },
  })
}

export function useResetAll() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => resetAllData(),
    onSuccess: () => {
      queryClient.setQueryData(workspacesQueryKey, [])
      queryClient.removeQueries({ queryKey: chatKeys.all })
      queryClient.removeQueries({ queryKey: gitKeys.all })
      queryClient.invalidateQueries({ queryKey: workspacesQueryKey })
    },
  })
}

export function useCreateSession() {
  return useMutation({
    mutationFn: (body: CreateSessionBody = {}) => createSession(body),
  })
}

export function useDeleteSession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteSession(id),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: chatKeys.session(id) })
      queryClient.removeQueries({ queryKey: gitKeys.session(id) })
    },
  })
}

export function useUpdateWorkspaceOpenWithApp() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ workspaceId, appId }: { workspaceId: string; appId: string | null }) =>
      apiUpdateWorkspaceOpenWithApp(workspaceId, appId),
    onMutate: ({ workspaceId, appId }) => {
      setWorkspacesData(queryClient, (workspaces) =>
        workspaces.map((ws) =>
          ws.id !== workspaceId ? ws : { ...ws, openWithAppId: appId }
        )
      )
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: workspacesQueryKey })
    },
  })
}

export function useUpdateThreadModel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ threadId, modelId }: { threadId: string; modelId: string | null }) =>
      apiUpdateThreadModel(threadId, modelId),
    onMutate: ({ threadId, modelId }) => {
      setWorkspacesData(queryClient, (workspaces) =>
        workspaces.map((ws) => ({
          ...ws,
          threads: ws.threads.map((t) =>
            t.id !== threadId ? t : { ...t, modelId }
          ),
        }))
      )
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: workspacesQueryKey })
    },
  })
}

export function useUpdateThreadStopped() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ threadId, stopped }: { threadId: string; stopped: boolean }) =>
      apiUpdateThreadStopped(threadId, stopped),
    onMutate: ({ threadId, stopped }) => {
      setWorkspacesData(queryClient, (workspaces) =>
        workspaces.map((ws) => ({
          ...ws,
          threads: ws.threads.map((t) =>
            t.id !== threadId ? t : { ...t, isStopped: stopped }
          ),
        }))
      )
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: workspacesQueryKey })
    },
  })
}

export function useUpdateThreadLastAccessed() {
  return useMutation({
    mutationFn: (threadId: string) => apiUpdateThreadLastAccessed(threadId),
  })
}

export function useArchiveThread() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ threadId }: { workspaceId: string; threadId: string }) =>
      apiArchiveThread(threadId),
    onSuccess: (_data, { workspaceId, threadId }) => {
      setWorkspacesData(queryClient, (workspaces) =>
        workspaces.map((workspace) =>
          workspace.id !== workspaceId
            ? workspace
            : {
                ...workspace,
                threads: workspace.threads.filter((t) => t.id !== threadId),
              }
        )
      )
      queryClient.invalidateQueries({ queryKey: workspacesQueryKey })
      queryClient.invalidateQueries({ queryKey: ["threads", "archived"] })
    },
  })
}

export function useUnarchiveThread() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (threadId: string) => apiUnarchiveThread(threadId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspacesQueryKey })
    },
  })
}

export function usePinThread() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (threadId: string) => apiPinThread(threadId),
    onMutate: (threadId) => {
      setWorkspacesData(queryClient, (workspaces) =>
        workspaces.map((workspace) => ({
          ...workspace,
          threads: workspace.threads.map((t) =>
            t.id === threadId ? { ...t, isPinned: true } : t
          ),
        }))
      )
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: workspacesQueryKey })
    },
  })
}

export function useUnpinThread() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (threadId: string) => apiUnpinThread(threadId),
    onMutate: (threadId) => {
      setWorkspacesData(queryClient, (workspaces) =>
        workspaces.map((workspace) => ({
          ...workspace,
          threads: workspace.threads.map((t) =>
            t.id === threadId ? { ...t, isPinned: false } : t
          ),
        }))
      )
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: workspacesQueryKey })
    },
  })
}
