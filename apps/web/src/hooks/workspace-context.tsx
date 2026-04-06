import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import { useNavigate } from "@tanstack/react-router"

import {
  listWorkspaces,
  createWorkspace as apiCreateWorkspace,
  deleteWorkspace as apiDeleteWorkspace,
  createThread as apiCreateThread,
  updateThreadTitle as apiUpdateThreadTitle,
  resetAllData,
  type WorkspaceDto,
  type ThreadDto,
} from "@/api/workspaces"

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
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // ── Init: fetch from server ────────────────────────────────────────────────
  useEffect(() => {
    listWorkspaces()
      .then(({ workspaces: ws }) => {
        setWorkspaces(ws)
      })
      .catch((err) => console.error("[workspace-context] init failed:", err))
      .finally(() => setIsLoading(false))
  }, [])

  // ── Actions ────────────────────────────────────────────────────────────────

  const createWorkspace = useCallback(
    async (name: string, path: string): Promise<Workspace> => {
      const { workspace } = await apiCreateWorkspace({ name, path })
      setWorkspaces((prev) => [...prev, workspace])
      return workspace
    },
    [],
  )

  const createThread = useCallback(async (workspaceId: string): Promise<Thread> => {
    const { thread } = await apiCreateThread(workspaceId)
    setWorkspaces((prev) =>
      prev.map((w) =>
        w.id === workspaceId ? { ...w, threads: [...w.threads, thread] } : w,
      ),
    )
    return thread
  }, [])

  const setThreadTitle = useCallback(
    (workspaceId: string, threadId: string, title: string) => {
      setWorkspaces((prev) =>
        prev.map((w) =>
          w.id !== workspaceId
            ? w
            : {
                ...w,
                threads: w.threads.map((t) =>
                  t.id === threadId ? { ...t, title } : t,
                ),
              },
        ),
      )
      apiUpdateThreadTitle(threadId, title).catch(console.error)
    },
    [],
  )

  const deleteWorkspace = useCallback(async (workspace: Workspace): Promise<void> => {
    await apiDeleteWorkspace(workspace.id)
    setWorkspaces((prev) => prev.filter((w) => w.id !== workspace.id))
  }, [])

  const resetAll = useCallback(async (): Promise<void> => {
    await resetAllData()
    setWorkspaces([])
  }, [])

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

/** Returns a stable callback that opens the native folder picker, creates a workspace, and navigates to its first thread. */
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
      navigate({ to: "/thread/$threadId", params: { threadId: firstThread.id } })
    }
  }, [createWorkspace, navigate])
}
