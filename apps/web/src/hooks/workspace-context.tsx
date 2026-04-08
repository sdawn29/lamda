import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { useNavigate } from "@tanstack/react-router"

import { useWorkspaces } from "@/queries/use-workspaces"
import {
  useCreateWorkspace as useCreateWorkspaceMutation,
  useDeleteWorkspace as useDeleteWorkspaceMutation,
  useCreateThread as useCreateThreadMutation,
  useUpdateThreadTitle,
  useResetAll as useResetAllMutation,
} from "@/mutations/use-workspace-mutations"
import type { WorkspaceDto, ThreadDto } from "@/api/workspaces"

export type Workspace = WorkspaceDto
export type Thread = ThreadDto

interface WorkspaceContextValue {
  workspaces: Workspace[]
  isLoading: boolean
  createWorkspace: (name: string, path: string) => Promise<Workspace>
  deleteWorkspace: (workspace: Workspace) => Promise<void>
  createThread: (workspaceId: string) => Promise<Thread>
  setThreadTitle: (workspaceId: string, threadId: string, title: string) => void
  resetAll: () => Promise<void>
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { data: workspacesData, isLoading } = useWorkspaces()
  const [optimisticWorkspaces, setOptimisticWorkspaces] = useState<Workspace[] | null>(null)

  const workspaces = useMemo(
    () => optimisticWorkspaces ?? workspacesData ?? [],
    [optimisticWorkspaces, workspacesData]
  )

  const createWorkspaceMutation = useCreateWorkspaceMutation()
  const deleteWorkspaceMutation = useDeleteWorkspaceMutation()
  const createThreadMutation = useCreateThreadMutation()
  const updateTitleMutation = useUpdateThreadTitle()
  const resetAllMutation = useResetAllMutation()

  const createWorkspace = useCallback(
    async (name: string, path: string): Promise<Workspace> => {
      const { workspace, existing } = await createWorkspaceMutation.mutateAsync({ name, path })
      if (!existing) {
        setOptimisticWorkspaces((prev) => [...(prev ?? workspaces), workspace])
      }
      return workspace
    },
    [createWorkspaceMutation, workspaces]
  )

  const deleteWorkspace = useCallback(
    async (workspace: Workspace): Promise<void> => {
      await deleteWorkspaceMutation.mutateAsync(workspace.id)
      setOptimisticWorkspaces((prev) =>
        (prev ?? workspaces).filter((w) => w.id !== workspace.id)
      )
    },
    [deleteWorkspaceMutation, workspaces]
  )

  const createThread = useCallback(
    async (workspaceId: string): Promise<Thread> => {
      const { thread } = await createThreadMutation.mutateAsync(workspaceId)
      setOptimisticWorkspaces((prev) =>
        (prev ?? workspaces).map((w) =>
          w.id === workspaceId ? { ...w, threads: [...w.threads, thread] } : w
        )
      )
      return thread
    },
    [createThreadMutation, workspaces]
  )

  const setThreadTitle = useCallback(
    (workspaceId: string, threadId: string, title: string) => {
      setOptimisticWorkspaces((prev) =>
        (prev ?? workspaces).map((w) =>
          w.id !== workspaceId
            ? w
            : {
                ...w,
                threads: w.threads.map((t) =>
                  t.id === threadId ? { ...t, title } : t
                ),
              }
        )
      )
      updateTitleMutation.mutate({ threadId, title })
    },
    [updateTitleMutation, workspaces]
  )

  const resetAll = useCallback(async (): Promise<void> => {
    await resetAllMutation.mutateAsync()
    setOptimisticWorkspaces([])
  }, [resetAllMutation])

  return (
    <WorkspaceContext
      value={{
        workspaces,
        isLoading,
        createWorkspace,
        deleteWorkspace,
        createThread,
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
  const { createWorkspace } = useWorkspace()
  const navigate = useNavigate()
  return useCallback(async () => {
    const folderPath = await window.electronAPI?.selectFolder()
    if (!folderPath) return
    const folderName = folderPath.split(/[/\\]/).pop() || folderPath
    const workspace = await createWorkspace(folderName, folderPath)
    const firstThread = workspace.threads[0]
    if (firstThread) {
      navigate({
        to: "/workspace/$threadId",
        params: { threadId: firstThread.id },
      })
    }
  }, [createWorkspace, navigate])
}
