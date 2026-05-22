import {
  useEffect,
  type ReactNode,
} from "react"
import { create } from "zustand"

interface FileTreeContextValue {
  isOpen: boolean
  toggle: () => void
  open: () => void
  close: () => void
}

interface FileTreeStore extends FileTreeContextValue {
  initialized: boolean
  setInitialized: (value: boolean) => void
}

const useFileTreeStore = create<FileTreeStore>((set) => ({
  initialized: false,
  isOpen: false,
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  setInitialized: (value) => set({ initialized: value }),
}))

export function FileTreeProvider({ children }: { children: ReactNode }) {
  const setInitialized = useFileTreeStore((state) => state.setInitialized)
  useEffect(() => {
    setInitialized(true)
    return () => setInitialized(false)
  }, [setInitialized])
  return <>{children}</>
}

export function useFileTree() {
  const initialized = useFileTreeStore((state) => state.initialized)
  const isOpen = useFileTreeStore((state) => state.isOpen)
  const toggle = useFileTreeStore((state) => state.toggle)
  const open = useFileTreeStore((state) => state.open)
  const close = useFileTreeStore((state) => state.close)
  if (!initialized) {
    throw new Error("useFileTree must be used within a FileTreeProvider")
  }
  return { isOpen, toggle, open, close }
}
