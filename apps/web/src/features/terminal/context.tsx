import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"

export interface TerminalTab {
  id: string
  title: string
}

let tabCounter = 0
function makeTab(): TerminalTab {
  tabCounter++
  return { id: crypto.randomUUID(), title: `Terminal ${tabCounter}` }
}

interface TerminalContextValue {
  isOpen: boolean
  toggle: () => void
  open: () => void
  close: () => void
  tabs: TerminalTab[]
  activeTabId: string | null
  addTab: () => void
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  renameTab: (id: string, title: string) => void
}

const TerminalContext = createContext<TerminalContextValue | null>(null)

export function TerminalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [tabs, setTabs] = useState<TerminalTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)

  const open = useCallback(() => {
    setIsOpen(true)
    setTabs((prev) => {
      if (prev.length > 0) return prev
      const tab = makeTab()
      setActiveTabId(tab.id)
      return [tab]
    })
  }, [])

  const toggle = useCallback(() => {
    setIsOpen((v) => {
      if (!v) {
        setTabs((prev) => {
          if (prev.length > 0) return prev
          const tab = makeTab()
          setActiveTabId(tab.id)
          return [tab]
        })
      }
      return !v
    })
  }, [])

  const close = useCallback(() => setIsOpen(false), [])

  const addTab = useCallback(() => {
    const tab = makeTab()
    setTabs((prev) => [...prev, tab])
    setActiveTabId(tab.id)
  }, [])

  const closeTab = useCallback((id: string) => {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === id)
      if (idx === -1) return prev
      const next = prev.filter((t) => t.id !== id)
      if (next.length === 0) {
        setIsOpen(false)
        setActiveTabId(null)
        tabCounter = 0
        return next
      }
      setActiveTabId((active) => {
        if (active !== id) return active
        // switch to adjacent tab
        const newIdx = idx > 0 ? idx - 1 : 0
        return next[newIdx].id
      })
      return next
    })
  }, [])

  const renameTab = useCallback((id: string, title: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === id ? { ...t, title } : t))
    )
  }, [])

  const value = useMemo(
    () => ({
      isOpen,
      toggle,
      open,
      close,
      tabs,
      activeTabId,
      addTab,
      closeTab,
      setActiveTab: setActiveTabId,
      renameTab,
    }),
    [isOpen, toggle, open, close, tabs, activeTabId, addTab, closeTab, renameTab]
  )

  return <TerminalContext value={value}>{children}</TerminalContext>
}

export function useTerminal() {
  const ctx = useContext(TerminalContext)
  if (!ctx) throw new Error("useTerminal must be used within TerminalProvider")
  return ctx
}
