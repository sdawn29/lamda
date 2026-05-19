import { create } from "zustand"

export type RightSidebarPanel = "files" | "changes"

interface RightSidebarStore {
  isOpen: boolean
  isFileTreeOpen: boolean
  width: number

  open: () => void
  close: () => void
  toggle: () => void
  openFileTree: () => void
  closeFileTree: () => void
  toggleFileTree: () => void
  togglePanel: (panel: RightSidebarPanel) => void
  setWidth: (width: number) => void
}

export const useRightSidebarStore = create<RightSidebarStore>()((set) => ({
  isOpen: false,
  isFileTreeOpen: false,
  width: 320,

  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false, isFileTreeOpen: false }),
  toggle: () =>
    set((s) => ({
      isOpen: !s.isOpen,
      isFileTreeOpen: s.isOpen ? false : s.isFileTreeOpen,
    })),

  openFileTree: () => set({ isFileTreeOpen: true }),
  closeFileTree: () => set({ isFileTreeOpen: false }),
  toggleFileTree: () => set((s) => ({ isFileTreeOpen: !s.isFileTreeOpen })),

  togglePanel: (panel) =>
    set((s) => {
      if (panel === "changes") {
        if (s.isOpen) return { isOpen: false, isFileTreeOpen: false }
        return { isOpen: true }
      }
      return { isFileTreeOpen: !s.isFileTreeOpen }
    }),

  setWidth: (width) => set({ width }),
}))

export function useRightSidebar() {
  return useRightSidebarStore()
}
