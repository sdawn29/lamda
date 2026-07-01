import { create } from "zustand"
import type { Automation } from "./types"

interface AutomationsUiStore {
  formOpen: boolean
  editing: Automation | null
  openNew: () => void
  openEdit: (automation: Automation) => void
  closeForm: () => void
}

/** Shared with the title bar, which renders the "New" button for /automations. */
export const useAutomationsUiStore = create<AutomationsUiStore>()((set) => ({
  formOpen: false,
  editing: null,
  openNew: () => set({ formOpen: true, editing: null }),
  openEdit: (automation) => set({ formOpen: true, editing: automation }),
  closeForm: () => set({ formOpen: false }),
}))
