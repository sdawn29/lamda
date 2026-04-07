import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"

interface DiffPanelContextValue {
  isOpen: boolean
  toggle: () => void
  open: () => void
  close: () => void
}

const DiffPanelContext = createContext<DiffPanelContextValue | null>(null)

export function DiffPanelProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)

  const toggle = useCallback(() => setIsOpen((v) => !v), [])
  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])

  const value = useMemo(
    () => ({ isOpen, toggle, open, close }),
    [isOpen, toggle, open, close]
  )

  return <DiffPanelContext value={value}>{children}</DiffPanelContext>
}

export function useDiffPanel() {
  const ctx = useContext(DiffPanelContext)
  if (!ctx)
    throw new Error("useDiffPanel must be used within DiffPanelProvider")
  return ctx
}
