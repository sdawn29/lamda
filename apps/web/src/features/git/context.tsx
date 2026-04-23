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
  toggleFullscreen: () => void
  tabs: DiffPanelTab[]
  activeTabId: string | null
  addTab: (tab: Omit<DiffPanelTab, "id">) => void
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  setActiveTabByFilePath: (filePath: string) => void
  renameTab: (id: string, title: string) => void
  currentWorkspacePath: string | null
  setCurrentWorkspace: (path: string | null) => void
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
  const [currentWorkspacePath, setCurrentWorkspacePath] = useState<string | null>(null)
  // Store file tabs per workspace
  const [workspaceTabs, setWorkspaceTabsState] = useState<Record<string, DiffPanelTab[]>>({})

  const toggle = useCallback(
    () =>
      setIsOpen((v) => {
        if (v) setIsFullscreen(false)
        return !v
      }),
    []
  )
  const open = useCallback(() => {
    setIsOpen(true)
  }, [])
  const close = useCallback(() => {
    setIsOpen(false)
    setIsFullscreen(false)
  }, [])
  const toggleFullscreen = useCallback(() => setIsFullscreen((v) => !v), [])

  const addTab = useCallback((tab: Omit<DiffPanelTab, "id">) => {
    // Prevent duplicate Source Control tabs
    if (tab.type === "source-control") {
      return
    }

    setTabs((prev) => {
      // Check if file already exists in tabs
      if (tab.filePath) {
        const existingTab = prev.find((t) => t.filePath === tab.filePath)
        if (existingTab) {
          // File already open, just switch to it
          setActiveTabId(existingTab.id)
          return prev
        }
      }

      const id = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const newTabs = [...prev, { ...tab, id }]
      setActiveTabId(id)

      // Save to workspace tabs if we have a current workspace
      if (currentWorkspacePath) {
        const fileTabs = newTabs.filter((t) => t.type === "file")
        setWorkspaceTabsState((prev) => ({
          ...prev,
          [currentWorkspacePath]: fileTabs,
        }))
      }

      return newTabs
    })
  }, [currentWorkspacePath])

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

      // Update workspace tabs
      if (currentWorkspacePath) {
        const fileTabs = newTabs.filter((t) => t.type === "file")
        setWorkspaceTabsState((prev) => ({
          ...prev,
          [currentWorkspacePath]: fileTabs,
        }))
      }

      return newTabs
    })
  }, [activeTabId, currentWorkspacePath])

  const setActiveTab = useCallback((id: string) => setActiveTabId(id), [])

  const setActiveTabByFilePath = useCallback((filePath: string) => {
    setTabs((prev) => {
      const tab = prev.find((t) => t.filePath === filePath)
      if (tab) {
        setActiveTabId(tab.id)
      }
      return prev
    })
  }, [])

  const renameTab = useCallback((id: string, title: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === id ? { ...t, title } : t))
    )
  }, [])

  const setCurrentWorkspace = useCallback((path: string | null) => {
    if (path === currentWorkspacePath) return

    // Save current file tabs before switching
    if (currentWorkspacePath) {
      const fileTabs = tabs.filter((t) => t.type === "file")
      if (fileTabs.length > 0) {
        setWorkspaceTabsState((prev) => ({
          ...prev,
          [currentWorkspacePath]: fileTabs,
        }))
      }
    }

    // Switch to new workspace
    setCurrentWorkspacePath(path)

    if (path) {
      // Restore tabs for new workspace
      const savedTabs = workspaceTabs[path] || []
      if (savedTabs.length > 0) {
        setTabs([SOURCE_CONTROL_TAB, ...savedTabs])
        setActiveTabId(savedTabs[0].id)
      } else {
        setTabs([SOURCE_CONTROL_TAB])
        setActiveTabId("tab-source-control")
      }
    } else {
      setTabs([SOURCE_CONTROL_TAB])
      setActiveTabId("tab-source-control")
    }
  }, [currentWorkspacePath, tabs, workspaceTabs])

  const value = useMemo(
    () => ({
      isOpen,
      toggle,
      open,
      close,
      isFullscreen,
      toggleFullscreen,
      tabs,
      activeTabId,
      addTab,
      closeTab,
      setActiveTab,
      setActiveTabByFilePath,
      renameTab,
      currentWorkspacePath,
      setCurrentWorkspace,
    }),
    [
      isOpen,
      toggle,
      open,
      close,
      isFullscreen,
      toggleFullscreen,
      tabs,
      activeTabId,
      addTab,
      closeTab,
      setActiveTab,
      setActiveTabByFilePath,
      renameTab,
      currentWorkspacePath,
      setCurrentWorkspace,
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