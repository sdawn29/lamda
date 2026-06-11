import { useCallback, useEffect, useMemo, type ReactNode } from "react"
import { useNavigate } from "@tanstack/react-router"
import { create } from "zustand"

import { useWorkspaces } from "./queries"
import {
  useArchiveThread as useArchiveThreadMutation,
  useCloneRepository,
  useCreateThread as useCreateThreadMutation,
  useCreateWorkspace as useCreateWorkspaceMutation,
  useDeleteThread as useDeleteThreadMutation,
  useDeleteWorkspace as useDeleteWorkspaceMutation,
  usePinThread as usePinThreadMutation,
  usePinWorkspace as usePinWorkspaceMutation,
  useResetAll as useResetAllMutation,
  useUnpinThread as useUnpinThreadMutation,
  useUnpinWorkspace as useUnpinWorkspaceMutation,
  useUpdateThreadTitle,
} from "./mutations"
import {
  type CreateThreadOptions,
  type ThreadDto,
  type WorkspaceDto,
} from "./api"

export type Workspace = WorkspaceDto
export type Thread = ThreadDto

interface WorkspaceContextValue {
  workspaces: Workspace[]
  isLoading: boolean
  createWorkspace: (name: string, path: string) => Promise<Workspace>
  cloneRepository: (url: string, path: string) => Promise<Workspace>
  deleteWorkspace: (workspace: Workspace) => Promise<void>
  createThread: (
    workspaceId: string,
    options?: CreateThreadOptions
  ) => Promise<Thread>
  deleteThread: (workspaceId: string, threadId: string) => Promise<void>
  archiveThread: (workspaceId: string, threadId: string) => Promise<void>
  pinThread: (workspaceId: string, threadId: string) => Promise<void>
  unpinThread: (workspaceId: string, threadId: string) => Promise<void>
  pinWorkspace: (workspaceId: string) => Promise<void>
  unpinWorkspace: (workspaceId: string) => Promise<void>
  setThreadTitle: (workspaceId: string, threadId: string, title: string) => void
  resetAll: () => Promise<void>
}

interface WorkspaceUiStore {
  isProviderMounted: boolean
  setProviderMounted: (value: boolean) => void
}

const useWorkspaceUiStore = create<WorkspaceUiStore>((set) => ({
  isProviderMounted: false,
  setProviderMounted: (value) => set({ isProviderMounted: value }),
}))

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  // Keep provider for tree-compatibility; no network state mirroring to avoid loops.
  const setProviderMounted = useWorkspaceUiStore((state) => state.setProviderMounted)
  useEffect(() => {
    setProviderMounted(true)
    return () => setProviderMounted(false)
  }, [setProviderMounted])
  return <>{children}</>
}

export function useWorkspace(): WorkspaceContextValue {
  const { data: workspaces = [], isLoading } = useWorkspaces()

  const createWorkspaceMutation = useCreateWorkspaceMutation()
  const deleteWorkspaceMutation = useDeleteWorkspaceMutation()
  const createThreadMutation = useCreateThreadMutation()
  const deleteThreadMutation = useDeleteThreadMutation()
  const archiveThreadMutation = useArchiveThreadMutation()
  const pinThreadMutation = usePinThreadMutation()
  const unpinThreadMutation = useUnpinThreadMutation()
  const pinWorkspaceMutation = usePinWorkspaceMutation()
  const unpinWorkspaceMutation = useUnpinWorkspaceMutation()
  const updateTitleMutation = useUpdateThreadTitle()
  const resetAllMutation = useResetAllMutation()
  const cloneRepositoryMutation = useCloneRepository()

  const createWorkspace = useCallback(
    async (name: string, path: string): Promise<Workspace> => {
      const { workspace } = await createWorkspaceMutation.mutateAsync({ name, path })
      return workspace
    },
    [createWorkspaceMutation]
  )

  const cloneRepository = useCallback(
    async (url: string, path: string): Promise<Workspace> => {
      const clonedPath = await cloneRepositoryMutation.mutateAsync({ url, path })
      const folderName = clonedPath.split(/[/\\]/).pop() || clonedPath
      const { workspace } = await createWorkspaceMutation.mutateAsync({
        name: folderName,
        path: clonedPath,
      })
      return workspace
    },
    [cloneRepositoryMutation, createWorkspaceMutation]
  )

  const deleteWorkspace = useCallback(
    async (workspace: Workspace): Promise<void> => {
      await deleteWorkspaceMutation.mutateAsync(workspace)
    },
    [deleteWorkspaceMutation]
  )

  const createThread = useCallback(
    async (
      workspaceId: string,
      options?: CreateThreadOptions
    ): Promise<Thread> => {
      const { thread } = await createThreadMutation.mutateAsync({
        workspaceId,
        options,
      })
      return thread
    },
    [createThreadMutation]
  )

  const deleteThread = useCallback(
    async (workspaceId: string, threadId: string): Promise<void> => {
      await deleteThreadMutation.mutateAsync({ workspaceId, threadId })
    },
    [deleteThreadMutation]
  )

  const archiveThread = useCallback(
    async (workspaceId: string, threadId: string): Promise<void> => {
      await archiveThreadMutation.mutateAsync({ workspaceId, threadId })
    },
    [archiveThreadMutation]
  )

  const pinThread = useCallback(
    async (workspaceId: string, threadId: string): Promise<void> => {
      await pinThreadMutation.mutateAsync(threadId)
      void workspaceId
    },
    [pinThreadMutation]
  )

  const unpinThread = useCallback(
    async (workspaceId: string, threadId: string): Promise<void> => {
      await unpinThreadMutation.mutateAsync(threadId)
      void workspaceId
    },
    [unpinThreadMutation]
  )

  const pinWorkspace = useCallback(
    async (workspaceId: string): Promise<void> => {
      await pinWorkspaceMutation.mutateAsync(workspaceId)
    },
    [pinWorkspaceMutation]
  )

  const unpinWorkspace = useCallback(
    async (workspaceId: string): Promise<void> => {
      await unpinWorkspaceMutation.mutateAsync(workspaceId)
    },
    [unpinWorkspaceMutation]
  )

  const setThreadTitle = useCallback(
    (workspaceId: string, threadId: string, title: string) => {
      updateTitleMutation.mutate({ workspaceId, threadId, title })
    },
    [updateTitleMutation]
  )

  const resetAll = useCallback(async (): Promise<void> => {
    await resetAllMutation.mutateAsync()
  }, [resetAllMutation])

  return useMemo(
    () => ({
      workspaces,
      isLoading,
      createWorkspace,
      cloneRepository,
      deleteWorkspace,
      createThread,
      deleteThread,
      archiveThread,
      pinThread,
      unpinThread,
      pinWorkspace,
      unpinWorkspace,
      setThreadTitle,
      resetAll,
    }),
    [
      workspaces,
      isLoading,
      createWorkspace,
      cloneRepository,
      deleteWorkspace,
      createThread,
      deleteThread,
      archiveThread,
      pinThread,
      unpinThread,
      pinWorkspace,
      unpinWorkspace,
      setThreadTitle,
      resetAll,
    ]
  )
}

export function useCreateWorkspaceAction() {
  const { createWorkspace, cloneRepository } = useWorkspace()
  const navigate = useNavigate()

  const handleCreateLocal = useCallback(
    async (path: string) => {
      const folderName = path.split(/[/\\]/).pop() || path
      const workspace = await createWorkspace(folderName, path)
      navigate({ to: "/new", search: { ws: workspace.id } })
    },
    [createWorkspace, navigate]
  )

  const handleCreateRemote = useCallback(
    async (url: string, path: string) => {
      const workspace = await cloneRepository(url, path)
      navigate({ to: "/new", search: { ws: workspace.id } })
    },
    [cloneRepository, navigate]
  )

  return { handleCreateLocal, handleCreateRemote }
}
