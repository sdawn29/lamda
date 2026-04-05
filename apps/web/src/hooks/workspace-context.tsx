import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"

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
  activeWorkspace: Workspace | null
  activeThread: Thread | null
  isLoading: boolean
  createWorkspace: (name: string, path: string) => Promise<Workspace>
  selectWorkspace: (workspace: Workspace) => void
  deleteWorkspace: (workspace: Workspace) => Promise<void>
  createThread: (workspaceId: string) => Promise<Thread>
  selectThread: (workspaceId: string, thread: Thread) => void
  setThreadTitle: (workspaceId: string, threadId: string, title: string) => void
  resetAll: () => Promise<void>
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

const LS_WORKSPACE_KEY = "lambda-code:activeWorkspaceId"
const LS_THREAD_KEY = "lambda-code:activeThreadId"

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null)
  const [activeThread, setActiveThread] = useState<Thread | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // ── Init: fetch from server and restore last selection ─────────────────────
  useEffect(() => {
    listWorkspaces()
      .then(({ workspaces: ws }) => {
        setWorkspaces(ws)

        const savedWsId = localStorage.getItem(LS_WORKSPACE_KEY)
        const savedThId = localStorage.getItem(LS_THREAD_KEY)
        const restoredWs = ws.find((w) => w.id === savedWsId) ?? ws[0] ?? null
        const restoredTh =
          restoredWs?.threads.find((t) => t.id === savedThId) ??
          restoredWs?.threads[0] ??
          null

        setActiveWorkspace(restoredWs)
        setActiveThread(restoredTh)
      })
      .catch((err) => console.error("[workspace-context] init failed:", err))
      .finally(() => setIsLoading(false))
  }, [])

  // ── Persist selection to localStorage ─────────────────────────────────────
  useEffect(() => {
    if (activeWorkspace) localStorage.setItem(LS_WORKSPACE_KEY, activeWorkspace.id)
  }, [activeWorkspace])

  useEffect(() => {
    if (activeThread) localStorage.setItem(LS_THREAD_KEY, activeThread.id)
  }, [activeThread])

  // ── Actions ────────────────────────────────────────────────────────────────

  const createWorkspace = useCallback(
    async (name: string, path: string): Promise<Workspace> => {
      const { workspace } = await apiCreateWorkspace({ name, path })
      setWorkspaces((prev) => [...prev, workspace])
      setActiveWorkspace(workspace)
      setActiveThread(workspace.threads[0] ?? null)
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
    setActiveWorkspace((prev) =>
      prev?.id === workspaceId
        ? { ...prev, threads: [...prev.threads, thread] }
        : prev,
    )
    setActiveThread(thread)
    return thread
  }, [])

  const selectThread = useCallback((workspaceId: string, thread: Thread) => {
    setWorkspaces((prev) => {
      const ws = prev.find((w) => w.id === workspaceId)
      if (ws) setActiveWorkspace(ws)
      return prev
    })
    setActiveThread(thread)
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
      setActiveThread((prev) =>
        prev?.id === threadId ? { ...prev, title } : prev,
      )
      apiUpdateThreadTitle(threadId, title).catch(console.error)
    },
    [],
  )

  const selectWorkspace = useCallback((workspace: Workspace) => {
    setActiveWorkspace(workspace)
    setActiveThread(workspace.threads[0] ?? null)
  }, [])

  const deleteWorkspace = useCallback(async (workspace: Workspace): Promise<void> => {
    await apiDeleteWorkspace(workspace.id)
    setWorkspaces((prev) => prev.filter((w) => w.id !== workspace.id))
    setActiveWorkspace((prev) => (prev?.id === workspace.id ? null : prev))
    setActiveThread((prev) =>
      workspace.threads.some((t) => t.id === prev?.id) ? null : prev,
    )
  }, [])

  const resetAll = useCallback(async (): Promise<void> => {
    await resetAllData()
    setWorkspaces([])
    setActiveWorkspace(null)
    setActiveThread(null)
  }, [])

  return (
    <WorkspaceContext
      value={{
        workspaces,
        activeWorkspace,
        activeThread,
        isLoading,
        createWorkspace,
        selectWorkspace,
        deleteWorkspace,
        createThread,
        selectThread,
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
