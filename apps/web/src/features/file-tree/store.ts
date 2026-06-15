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

  /**
   * Relative path the tree should scroll to once it appears in the flattened
   * rows. Set by `reveal`, consumed (and cleared) by the FileTree component.
   */
  revealTarget: string | null
  /** Expand a directory and all of its ancestors, then scroll it into view. */
  reveal: (relativePath: string) => void
  clearRevealTarget: () => void
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

  revealTarget: null,
  reveal: (relativePath) =>
    set((s) => {
      const rel = relativePath.replace(/^\/+|\/+$/g, "")
      if (!rel) return s
      const next = new Set(s.expanded)
      const segments = rel.split("/")
      let acc = ""
      for (const seg of segments) {
        acc = acc ? `${acc}/${seg}` : seg
        next.add(acc)
      }
      return { expanded: next, revealTarget: rel }
    }),
  clearRevealTarget: () => set({ revealTarget: null }),
}))
