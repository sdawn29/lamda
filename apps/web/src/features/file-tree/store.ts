import { create } from "zustand"

interface FileTreeStore {
  isOpen: boolean
  toggle: () => void
  open: () => void
  close: () => void

  /** Relative paths of directories the user has expanded in the tree. */
  expanded: Set<string>
  toggleDir: (relativePath: string) => void
  collapseAll: () => void
}

export const useFileTree = create<FileTreeStore>()((set) => ({
  isOpen: false,
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),

  expanded: new Set(),
  toggleDir: (relativePath) =>
    set((s) => {
      const next = new Set(s.expanded)
      if (next.has(relativePath)) {
        next.delete(relativePath)
      } else {
        next.add(relativePath)
      }
      return { expanded: next }
    }),
  collapseAll: () => set({ expanded: new Set() }),
}))
