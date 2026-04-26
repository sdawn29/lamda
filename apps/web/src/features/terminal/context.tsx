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
  addTab: () => string
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  renameTab: (id: string, title: string) => void
  killAll: () => void
}

const TerminalContext = createContext<TerminalContextValue | null>(null)

export function TerminalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [tabs, setTabs] = useState<TerminalTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)

  const open = useCallback(() => {
    const tab = makeTab()
    setIsOpen(true)
    setTabs([tab])
    setActiveTabId(tab.id)
  }, [])

  const toggle = useCallback(() => {
    setIsOpen((v) => {
      if (!v) {
        const tab = makeTab()
        setTabs([tab])
        setActiveTabId(tab.id)
      }
      return !v
    })
  }, [])

  const close = useCallback(() => setIsOpen(false), [])

  const addTab = useCallback(() => {
    const tab = makeTab()
    setTabs((prev) => [...prev, tab])
    setActiveTabId(tab.id)
    return tab.id
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

  const killAll = useCallback(() => {
    tabCounter = 0
    setTabs([])
    setIsOpen(false)
    setActiveTabId(null)
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
      killAll,
    }),
    [isOpen, toggle, open, close, tabs, activeTabId, addTab, closeTab, renameTab, killAll]
  )

  return <TerminalContext value={value}>{children}</TerminalContext>
}

export function useTerminal() {
  const ctx = useContext(TerminalContext)
  if (!ctx) throw new Error("useTerminal must be used within TerminalProvider")
  return ctx
}