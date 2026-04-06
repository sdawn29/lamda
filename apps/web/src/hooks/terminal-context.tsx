import { createContext, useCallback, useContext, useState, type ReactNode } from "react"

interface TerminalContextValue {
  isOpen: boolean
  toggle: () => void
  open: () => void
  close: () => void
}

const TerminalContext = createContext<TerminalContextValue | null>(null)

export function TerminalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)

  const toggle = useCallback(() => setIsOpen((v) => !v), [])
  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])

  return (
    <TerminalContext value={{ isOpen, toggle, open, close }}>
      {children}
    </TerminalContext>
  )
}

export function useTerminal() {
  const ctx = useContext(TerminalContext)
  if (!ctx) throw new Error("useTerminal must be used within TerminalProvider")
  return ctx
}
