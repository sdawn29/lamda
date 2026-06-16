import { create } from "zustand"

interface EnvDialogStore {
  /** Workspace whose environment variables dialog is open, or null when closed. */
  workspaceId: string | null
  openEnvDialog: (workspaceId: string) => void
  closeEnvDialog: () => void
}

/**
 * Shared open-state for the workspace environment-variables dialog so surfaces
 * without a workspace dropdown (command palette, slash menu) can open it for
 * the active workspace. The dialog itself is still rendered by the sidebar.
 */
export const useEnvDialog = create<EnvDialogStore>()((set) => ({
  workspaceId: null,
  openEnvDialog: (workspaceId) => set({ workspaceId }),
  closeEnvDialog: () => set({ workspaceId: null }),
}))
