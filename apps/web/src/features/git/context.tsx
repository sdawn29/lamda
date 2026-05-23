import { useEffect, type ReactNode } from "react"
import { create } from "zustand"

export interface ReviewPanelTab {
  id: string
  title: string
  type: "source-control" | "file"
  filePath?: string
}

const SOURCE_CONTROL_TAB: ReviewPanelTab = {
  id: "tab-source-control",
  title: "Changes",
  type: "source-control",
}

interface ReviewPanelState {
  initialized: boolean
  isOpen: boolean
  isFullscreen: boolean
  tabs: ReviewPanelTab[]
  activeTabId: string | null
  pendingTabId: string | null
  currentWorkspacePath: string | null
  workspaceTabs: Record<string, ReviewPanelTab[]>
  setInitialized: (value: boolean) => void
  toggle: () => void
  open: () => void
  close: () => void
  toggleFullscreen: () => void
  addTab: (tab: Omit<ReviewPanelTab, "id">) => void
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  clearPendingTab: () => void
  renameTab: (id: string, title: string) => void
  setCurrentWorkspace: (path: string | null) => void
}

const useReviewPanelStore = create<ReviewPanelState>((set) => ({
  initialized: false,
  isOpen: false,
  isFullscreen: false,
  tabs: [SOURCE_CONTROL_TAB],
  activeTabId: SOURCE_CONTROL_TAB.id,
  pendingTabId: null,
  currentWorkspacePath: null,
  workspaceTabs: {},
  setInitialized: (value) => set({ initialized: value }),
  toggle: () =>
    set((state) => ({
      isOpen: !state.isOpen,
      isFullscreen: !state.isOpen ? state.isFullscreen : false,
    })),
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false, isFullscreen: false }),
  toggleFullscreen: () => set((state) => ({ isFullscreen: !state.isFullscreen })),
  addTab: (tab) =>
    set((state) => {
      if (tab.type === "source-control") return state

      if (tab.filePath) {
        const existingTab = state.tabs.find((item) => item.filePath === tab.filePath)
        if (existingTab) {
          return { activeTabId: existingTab.id, pendingTabId: existingTab.id }
        }
      }

      const id = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const newTab = { ...tab, id }
      const tabs = [...state.tabs, newTab]

      let workspaceTabs = state.workspaceTabs
      if (state.currentWorkspacePath) {
        const fileTabs = tabs.filter((item) => item.type === "file")
        workspaceTabs = {
          ...state.workspaceTabs,
          [state.currentWorkspacePath]: fileTabs,
        }
      }

      return {
        tabs,
        activeTabId: id,
        pendingTabId: id,
        workspaceTabs,
      }
    }),
  closeTab: (id) =>
    set((state) => {
      const tab = state.tabs.find((item) => item.id === id)
      if (tab?.type === "source-control") return state

      const tabs = state.tabs.filter((item) => item.id !== id)
      if (tabs.length === 0) {
        return {
          tabs: [SOURCE_CONTROL_TAB],
          activeTabId: SOURCE_CONTROL_TAB.id,
        }
      }

      let activeTabId = state.activeTabId
      if (state.activeTabId === id) {
        const closedIndex = state.tabs.findIndex((item) => item.id === id)
        const newActiveIndex = Math.max(0, closedIndex - 1)
        activeTabId = tabs[newActiveIndex].id
      }

      let workspaceTabs = state.workspaceTabs
      if (state.currentWorkspacePath) {
        const fileTabs = tabs.filter((item) => item.type === "file")
        workspaceTabs = {
          ...state.workspaceTabs,
          [state.currentWorkspacePath]: fileTabs,
        }
      }

      return { tabs, activeTabId, workspaceTabs }
    }),
  setActiveTab: (id) => set({ activeTabId: id }),
  clearPendingTab: () => set({ pendingTabId: null }),
  renameTab: (id, title) =>
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === id ? { ...tab, title } : tab
      ),
    })),
  setCurrentWorkspace: (path) =>
    set((state) => {
      let workspaceTabs = state.workspaceTabs
      if (state.currentWorkspacePath) {
        const fileTabs = state.tabs.filter((tab) => tab.type === "file")
        if (fileTabs.length > 0) {
          workspaceTabs = {
            ...state.workspaceTabs,
            [state.currentWorkspacePath]: fileTabs,
          }
        }
      }

      if (path) {
        const savedTabs = workspaceTabs[path] || []
        if (savedTabs.length > 0) {
          return {
            workspaceTabs,
            currentWorkspacePath: path,
            tabs: [SOURCE_CONTROL_TAB, ...savedTabs],
            activeTabId: savedTabs[0].id,
          }
        }
      }

      return {
        workspaceTabs,
        currentWorkspacePath: path,
        tabs: [SOURCE_CONTROL_TAB],
        activeTabId: SOURCE_CONTROL_TAB.id,
      }
    }),
}))

interface ReviewPanelContextValue {
  isOpen: boolean
  toggle: () => void
  open: () => void
  close: () => void
  isFullscreen: boolean
  toggleFullscreen: () => void
  tabs: ReviewPanelTab[]
  activeTabId: string | null
  pendingTabId: string | null
  addTab: (tab: Omit<ReviewPanelTab, "id">) => void
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  clearPendingTab: () => void
  renameTab: (id: string, title: string) => void
  currentWorkspacePath: string | null
  setCurrentWorkspace: (path: string | null) => void
}

export function ReviewPanelProvider({ children }: { children: ReactNode }) {
  const setInitialized = useReviewPanelStore((state) => state.setInitialized)

  useEffect(() => {
    setInitialized(true)
    return () => setInitialized(false)
  }, [setInitialized])

  return <>{children}</>
}

export function useReviewPanel(): ReviewPanelContextValue {
  const initialized = useReviewPanelStore((state) => state.initialized)
  const isOpen = useReviewPanelStore((state) => state.isOpen)
  const toggle = useReviewPanelStore((state) => state.toggle)
  const open = useReviewPanelStore((state) => state.open)
  const close = useReviewPanelStore((state) => state.close)
  const isFullscreen = useReviewPanelStore((state) => state.isFullscreen)
  const toggleFullscreen = useReviewPanelStore((state) => state.toggleFullscreen)
  const tabs = useReviewPanelStore((state) => state.tabs)
  const activeTabId = useReviewPanelStore((state) => state.activeTabId)
  const pendingTabId = useReviewPanelStore((state) => state.pendingTabId)
  const addTab = useReviewPanelStore((state) => state.addTab)
  const closeTab = useReviewPanelStore((state) => state.closeTab)
  const setActiveTab = useReviewPanelStore((state) => state.setActiveTab)
  const clearPendingTab = useReviewPanelStore((state) => state.clearPendingTab)
  const renameTab = useReviewPanelStore((state) => state.renameTab)
  const currentWorkspacePath = useReviewPanelStore((state) => state.currentWorkspacePath)
  const setCurrentWorkspace = useReviewPanelStore((state) => state.setCurrentWorkspace)

  if (!initialized) {
    throw new Error("useReviewPanel must be used within ReviewPanelProvider")
  }

  return {
    isOpen,
    toggle,
    open,
    close,
    isFullscreen,
    toggleFullscreen,
    tabs,
    activeTabId,
    pendingTabId,
    addTab,
    closeTab,
    setActiveTab,
    clearPendingTab,
    renameTab,
    currentWorkspacePath,
    setCurrentWorkspace,
  }
}
