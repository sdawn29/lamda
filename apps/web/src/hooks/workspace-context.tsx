import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react"

import { createSession, deleteSession } from "@/api/sessions"

export interface Workspace {
  id: string
  name: string
  path: string
  sessionId: string
}

interface WorkspaceContextValue {
  workspaces: Workspace[]
  activeWorkspace: Workspace | null
  createWorkspace: (name: string, path: string) => Promise<Workspace>
  selectWorkspace: (workspace: Workspace) => void
  deleteWorkspace: (workspace: Workspace) => void
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

let idCounter = 0
function generateId(): string {
  return `ws-${++idCounter}-${Date.now()}`
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null)

  const createWorkspace = useCallback(
    async (name: string, path: string): Promise<Workspace> => {
      const { sessionId } = await createSession({ cwd: path })
      const workspace: Workspace = { id: generateId(), name, path, sessionId }
      setWorkspaces((prev) => [...prev, workspace])
      setActiveWorkspace(workspace)
      return workspace
    },
    []
  )

  const selectWorkspace = useCallback((workspace: Workspace) => {
    setActiveWorkspace(workspace)
  }, [])

  const deleteWorkspace = useCallback((workspace: Workspace) => {
    deleteSession(workspace.sessionId).catch(() => {})
    setWorkspaces((prev) => prev.filter((w) => w.id !== workspace.id))
    setActiveWorkspace((prev) => (prev?.id === workspace.id ? null : prev))
  }, [])

  return (
    <WorkspaceContext
      value={{
        workspaces,
        activeWorkspace,
        createWorkspace,
        selectWorkspace,
        deleteWorkspace,
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
