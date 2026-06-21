import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"

interface WorkspaceCollapseStore {
  /** Per-workspace collapsed state, keyed by workspace id. Absent = expanded. */
  collapsed: Record<string, boolean>
  setCollapsed: (workspaceId: string, collapsed: boolean) => void
  toggle: (workspaceId: string) => void
}

/**
 * Durable collapsed/expanded state for each workspace group in the left
 * sidebar. Previously held in component state, so every reload re-expanded all
 * workspaces; persisting it here lets the sidebar remember which groups the
 * user collapsed. Persisted to localStorage via zustand's `persist` middleware.
 */
export const useWorkspaceCollapseStore = create<WorkspaceCollapseStore>()(
  persist(
    (set) => ({
      collapsed: {},
      setCollapsed: (workspaceId, collapsed) =>
        set((s) => ({
          collapsed: { ...s.collapsed, [workspaceId]: collapsed },
        })),
      toggle: (workspaceId) =>
        set((s) => ({
          collapsed: {
            ...s.collapsed,
            [workspaceId]: !s.collapsed[workspaceId],
          },
        })),
    }),
    {
      name: "sidebar:workspace-collapse",
      storage: createJSONStorage(() => localStorage),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<WorkspaceCollapseStore>
        const collapsed =
          p.collapsed && typeof p.collapsed === "object"
            ? p.collapsed
            : current.collapsed
        return { ...current, collapsed }
      },
    }
  )
)
