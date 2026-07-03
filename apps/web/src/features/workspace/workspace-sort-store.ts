import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"

export type WorkspaceSortOrder = "name" | "created-desc" | "created-asc"

interface WorkspaceSortStore {
  sortOrder: WorkspaceSortOrder
  setSortOrder: (order: WorkspaceSortOrder) => void
}

/**
 * Durable sort preference for the workspace list in the left sidebar.
 * Persisted to localStorage via zustand's `persist` middleware.
 */
export const useWorkspaceSortStore = create<WorkspaceSortStore>()(
  persist(
    (set) => ({
      sortOrder: "created-asc",
      setSortOrder: (order) => set({ sortOrder: order }),
    }),
    {
      name: "sidebar:workspace-sort",
      storage: createJSONStorage(() => localStorage),
    }
  )
)
