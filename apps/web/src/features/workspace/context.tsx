import { createContext, useCallback, useContext, type ReactNode } from "react"
import { useNavigate } from "@tanstack/react-router"

import { useWorkspaces } from "./queries"
import {
  useCreateWorkspace as useCreateWorkspaceMutation,
  useDeleteWorkspace as useDeleteWorkspaceMutation,
  useCreateThread as useCreateThreadMutation,
  useDeleteThread as useDeleteThreadMutation,
  useArchiveThread as useArchiveThreadMutation,
  usePinThread as usePinThreadMutation,
  useUnpinThread as useUnpinThreadMutation,
  useUpdateThreadTitle,
  useResetAll as useResetAllMutation,
  useCloneRepository,
} from "./mutations"
import { type WorkspaceDto, type ThreadDto } from "./api"

export type Workspace = WorkspaceDto
export type Thread = ThreadDto

interface WorkspaceContextValue {
  workspaces: Workspace[]
  isLoading: boolean
  createWorkspace: (name: string, path: string) => Promise<Workspace>
  cloneRepository: (url: string, path: string) => Promise<Workspace>
  deleteWorkspace: (workspace: Workspace) => Promise<void>
  createThread: (workspaceId: string) => Promise<Thread>
  deleteThread: (workspaceId: string, threadId: string) => Promise<void>
  archiveThread: (workspaceId: string, threadId: string) => Promise<void>
  pinThread: (workspaceId: string, threadId: string) => Promise<void>
  unpinThread: (workspaceId: string, threadId: string) => Promise<void>
  setThreadTitle: (workspaceId: string, threadId: string, title: string) => void
  resetAll: () => Promise<void>
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { data: workspaces = [], isLoading } = useWorkspaces()

  const createWorkspaceMutation = useCreateWorkspaceMutation()
  const deleteWorkspaceMutation = useDeleteWorkspaceMutation()
  const createThreadMutation = useCreateThreadMutation()
  const deleteThreadMutation = useDeleteThreadMutation()
  const archiveThreadMutation = useArchiveThreadMutation()
  const pinThreadMutation = usePinThreadMutation()
  const unpinThreadMutation = useUnpinThreadMutation()
  const updateTitleMutation = useUpdateThreadTitle()
  const resetAllMutation = useResetAllMutation()
  const cloneRepositoryMutation = useCloneRepository()

  const createWorkspace = useCallback(
    async (name: string, path: string): Promise<Workspace> => {
      const { workspace } = await createWorkspaceMutation.mutateAsync({
        name,
        path,
      })
      return workspace
    },
    [createWorkspaceMutation]
  )

  const cloneRepository = useCallback(
    async (url: string, path: string): Promise<Workspace> => {
      await cloneRepositoryMutation.mutateAsync({ url, path })
      const folderName = path.split(/[/\\]/).pop() || path
      const { workspace } = await createWorkspaceMutation.mutateAsync({
        name: folderName,
        path,
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
    async (workspaceId: string): Promise<Thread> => {
      const { thread } = await createThreadMutation.mutateAsync(workspaceId)
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
    async (_workspaceId: string, threadId: string): Promise<void> => {
      await archiveThreadMutation.mutateAsync({ workspaceId: _workspaceId, threadId })
    },
    [archiveThreadMutation]
  )

  const pinThread = useCallback(
    async (_workspaceId: string, threadId: string): Promise<void> => {
      await pinThreadMutation.mutateAsync(threadId)
      void _workspaceId // reserved for future use
    },
    [pinThreadMutation]
  )

  const unpinThread = useCallback(
    async (_workspaceId: string, threadId: string): Promise<void> => {
      await unpinThreadMutation.mutateAsync(threadId)
      void _workspaceId // reserved for future use
    },
    [unpinThreadMutation]
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

  return (
    <WorkspaceContext
      value={{
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
        setThreadTitle,
        resetAll,
      }}
    >
      {children}
    </WorkspaceContext>
  )
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext)
  if (!context) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider")
  }
  return context
}

export function useCreateWorkspaceAction() {
  const { createWorkspace, cloneRepository } = useWorkspace()
  const navigate = useNavigate()

  const handleCreateLocal = useCallback(
    async (path: string) => {
      const folderName = path.split(/[/\\]/).pop() || path
      const workspace = await createWorkspace(folderName, path)
      const firstThread = workspace.threads[0]
      if (firstThread) {
        navigate({
          to: "/workspace/$threadId",
          params: { threadId: firstThread.id },
        })
      }
    },
    [createWorkspace, navigate]
  )

  const handleCreateRemote = useCallback(
    async (url: string, path: string) => {
      const workspace = await cloneRepository(url, path)
      const firstThread = workspace.threads[0]
      if (firstThread) {
        navigate({
          to: "/workspace/$threadId",
          params: { threadId: firstThread.id },
        })
      }
    },
    [cloneRepository, navigate]
  )

  return { handleCreateLocal, handleCreateRemote }
}
