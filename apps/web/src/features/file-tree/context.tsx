import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react"

interface FileTreeContextValue {
  isOpen: boolean
  toggle: () => void
  open: () => void
  close: () => void
}

const FileTreeContext = createContext<FileTreeContextValue | null>(null)

export function FileTreeProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)

  const toggle = useCallback(() => setIsOpen((prev) => !prev), [])
  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])

  return (
    <FileTreeContext value={{ isOpen, toggle, open, close }}>
      {children}
    </FileTreeContext>
  )
}

export function useFileTree() {
  const context = useContext(FileTreeContext)
  if (!context) {
    throw new Error("useFileTree must be used within a FileTreeProvider")
  }
  return context
}
