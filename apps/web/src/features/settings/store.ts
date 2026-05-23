import { create } from "zustand"

interface SettingsModalStore {
  open: boolean
  openSettings: () => void
  closeSettings: () => void
}

export const useSettingsModal = create<SettingsModalStore>()((set) => ({
  open: false,
  openSettings: () => set({ open: true }),
  closeSettings: () => set({ open: false }),
}))
