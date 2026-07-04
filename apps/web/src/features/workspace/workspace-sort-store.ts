import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"

export type WorkspaceSortOrder =
  | "manual"
  | "name"
  | "created-desc"
  | "created-asc"

interface WorkspaceSortStore {
  sortOrder: WorkspaceSortOrder
  manualWorkspaceIds: string[]
  setSortOrder: (order: WorkspaceSortOrder) => void
  setManualWorkspaceOrder: (workspaceIds: string[]) => void
}

/**
 * Durable sort preference for the workspace list in the left sidebar.
 * Persisted to localStorage via zustand's `persist` middleware.
 */
export const useWorkspaceSortStore = create<WorkspaceSortStore>()(
  persist(
    (set) => ({
      sortOrder: "created-asc",
      manualWorkspaceIds: [],
      setSortOrder: (order) => set({ sortOrder: order }),
      setManualWorkspaceOrder: (workspaceIds) =>
        set({ sortOrder: "manual", manualWorkspaceIds: workspaceIds }),
    }),
    {
      name: "sidebar:workspace-sort",
      storage: createJSONStorage(() => localStorage),
      merge: (persisted, current) => {
        const value = (persisted ?? {}) as Partial<WorkspaceSortStore>
        return {
          ...current,
          ...value,
          manualWorkspaceIds: Array.isArray(value.manualWorkspaceIds)
            ? value.manualWorkspaceIds
            : [],
        }
      },
    }
  )
)
