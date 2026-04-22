import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"

export interface DiffPanelTab {
  id: string
  title: string
  type: "source-control" | "file"
  filePath?: string
}

interface DiffPanelContextValue {
  isOpen: boolean
  toggle: () => void
  open: () => void
  close: () => void
  isFullscreen: boolean
  setIsFullscreen: (v: boolean) => void
  tabs: DiffPanelTab[]
  activeTabId: string | null
  addTab: (tab: Omit<DiffPanelTab, "id">) => void
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  renameTab: (id: string, title: string) => void
}

const SOURCE_CONTROL_TAB: DiffPanelTab = {
  id: "tab-source-control",
  title: "Source Control",
  type: "source-control",
}

const DiffPanelContext = createContext<DiffPanelContextValue | null>(null)

export function DiffPanelProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [tabs, setTabs] = useState<DiffPanelTab[]>([SOURCE_CONTROL_TAB])
  const [activeTabId, setActiveTabId] = useState<string | null>("tab-source-control")

  const toggle = useCallback(() => setIsOpen((v) => !v), [])
  const open = useCallback(() => {
    setIsOpen(true)
  }, [])
  const close = useCallback(() => {
    setIsOpen(false)
    setIsFullscreen(false)
  }, [])

  const addTab = useCallback((tab: Omit<DiffPanelTab, "id">) => {
    // Prevent duplicate Source Control tabs
    if (tab.type === "source-control") {
      return
    }
    const id = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setTabs((prev) => [...prev, { ...tab, id }])
    setActiveTabId(id)
  }, [])

  const closeTab = useCallback((id: string) => {
    setTabs((prev) => {
      const tab = prev.find((t) => t.id === id)
      // Prevent closing Source Control tab
      if (tab?.type === "source-control") {
        return prev
      }
      const newTabs = prev.filter((t) => t.id !== id)
      if (newTabs.length === 0) {
        // Return to Source Control tab if all closed
        setActiveTabId("tab-source-control")
        return [SOURCE_CONTROL_TAB]
      } else if (activeTabId === id) {
        const closedIndex = prev.findIndex((t) => t.id === id)
        const newActiveIndex = Math.max(0, closedIndex - 1)
        setActiveTabId(newTabs[newActiveIndex].id)
      }
      return newTabs
    })
  }, [activeTabId])

  const setActiveTab = useCallback((id: string) => setActiveTabId(id), [])

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
      isFullscreen,
      setIsFullscreen,
      tabs,
      activeTabId,
      addTab,
      closeTab,
      setActiveTab,
      renameTab,
    }),
    [
      isOpen,
      toggle,
      open,
      close,
      isFullscreen,
      setIsFullscreen,
      tabs,
      activeTabId,
      addTab,
      closeTab,
      setActiveTab,
      renameTab,
    ]
  )

  return <DiffPanelContext value={value}>{children}</DiffPanelContext>
}

export function useDiffPanel() {
  const ctx = useContext(DiffPanelContext)
  if (!ctx)
    throw new Error("useDiffPanel must be used within DiffPanelProvider")
  return ctx
}
