import { create } from "zustand"

export interface DiffPanelTab {
  id: string
  title: string
  type: "source-control" | "file"
  filePath?: string
}

const SOURCE_CONTROL_TAB: DiffPanelTab = {
  id: "tab-source-control",
  title: "Changes",
  type: "source-control",
}

interface DiffPanelStore {
  isOpen: boolean
  isFullscreen: boolean
  tabs: DiffPanelTab[]
  activeTabId: string | null
  pendingTabId: string | null
  currentWorkspacePath: string | null
  workspaceTabs: Record<string, DiffPanelTab[]>
  toggle: () => void
  open: () => void
  close: () => void
  toggleFullscreen: () => void
  addTab: (tab: Omit<DiffPanelTab, "id">) => void
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  clearPendingTab: () => void
  renameTab: (id: string, title: string) => void
  setCurrentWorkspace: (path: string | null) => void
}

export const useDiffPanelStore = create<DiffPanelStore>()((set) => ({
  isOpen: false,
  isFullscreen: false,
  tabs: [SOURCE_CONTROL_TAB],
  activeTabId: "tab-source-control",
  pendingTabId: null,
  currentWorkspacePath: null,
  workspaceTabs: {},

  toggle: () =>
    set((s) => ({
      isOpen: !s.isOpen,
      isFullscreen: !s.isOpen ? s.isFullscreen : false,
    })),

  open: () => set({ isOpen: true }),

  close: () => set({ isOpen: false, isFullscreen: false }),

  toggleFullscreen: () => set((s) => ({ isFullscreen: !s.isFullscreen })),

  addTab: (tab) =>
    set((s) => {
      if (tab.type === "source-control") return s

      if (tab.filePath) {
        const existingTab = s.tabs.find((t) => t.filePath === tab.filePath)
        if (existingTab) {
          return { activeTabId: existingTab.id, pendingTabId: existingTab.id }
        }
      }

      const id = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const newTab = { ...tab, id }
      const newTabs = [...s.tabs, newTab]

      let workspaceTabs = s.workspaceTabs
      if (s.currentWorkspacePath) {
        const fileTabs = newTabs.filter((t) => t.type === "file")
        workspaceTabs = { ...s.workspaceTabs, [s.currentWorkspacePath]: fileTabs }
      }

      return { tabs: newTabs, activeTabId: id, pendingTabId: id, workspaceTabs }
    }),

  closeTab: (id) =>
    set((s) => {
      const tab = s.tabs.find((t) => t.id === id)
      if (tab?.type === "source-control") return s

      const newTabs = s.tabs.filter((t) => t.id !== id)

      if (newTabs.length === 0) {
        return { tabs: [SOURCE_CONTROL_TAB], activeTabId: SOURCE_CONTROL_TAB.id }
      }

      let newActiveTabId = s.activeTabId
      if (s.activeTabId === id) {
        const closedIndex = s.tabs.findIndex((t) => t.id === id)
        newActiveTabId = newTabs[Math.max(0, closedIndex - 1)].id
      }

      let workspaceTabs = s.workspaceTabs
      if (s.currentWorkspacePath) {
        const fileTabs = newTabs.filter((t) => t.type === "file")
        workspaceTabs = { ...s.workspaceTabs, [s.currentWorkspacePath]: fileTabs }
      }

      return { tabs: newTabs, activeTabId: newActiveTabId, workspaceTabs }
    }),

  setActiveTab: (id) => set({ activeTabId: id }),

  clearPendingTab: () => set({ pendingTabId: null }),

  renameTab: (id, title) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, title } : t)),
    })),

  setCurrentWorkspace: (path) =>
    set((s) => {
      let workspaceTabs = s.workspaceTabs
      if (s.currentWorkspacePath) {
        const fileTabs = s.tabs.filter((t) => t.type === "file")
        if (fileTabs.length > 0) {
          workspaceTabs = { ...s.workspaceTabs, [s.currentWorkspacePath]: fileTabs }
        }
      }

      if (path) {
        const savedTabs = workspaceTabs[path] ?? []
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

export function useDiffPanel() {
  return useDiffPanelStore()
}
