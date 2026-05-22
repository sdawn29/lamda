import { useEffect, type ReactNode } from "react"
import { create } from "zustand"

export interface ThreadMainTab {
  id: string
  type: "thread"
  threadId: string
  title: string
}

export interface FileMainTab {
  id: string
  type: "file"
  filePath: string
  title: string
  workspacePath?: string
  openWithAppId?: string | null
}

export type MainTab = ThreadMainTab | FileMainTab

interface MainTabsState {
  initialized: boolean
  tabs: MainTab[]
  activeTabId: string | null
  setInitialized: (value: boolean) => void
  addThreadTab: (threadId: string, title: string) => void
  addFileTab: (tab: Omit<FileMainTab, "id" | "type">) => void
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  updateThreadTitle: (threadId: string, title: string) => void
  reorderTabs: (draggedId: string, targetId: string, before: boolean) => void
}

const useMainTabsStore = create<MainTabsState>((set) => ({
  initialized: false,
  tabs: [],
  activeTabId: null,
  setInitialized: (value) => set({ initialized: value }),
  addThreadTab: (threadId, title) =>
    set((state) => {
      const existing = state.tabs.find(
        (tab) => tab.type === "thread" && tab.threadId === threadId
      )
      if (existing) {
        return { activeTabId: existing.id }
      }
      const id = `thread-${threadId}`
      const newTab: ThreadMainTab = { id, type: "thread", threadId, title }
      return { tabs: [...state.tabs, newTab], activeTabId: id }
    }),
  addFileTab: (tab) =>
    set((state) => {
      const existing = state.tabs.find(
        (item) => item.type === "file" && item.filePath === tab.filePath
      )
      if (existing) {
        return { activeTabId: existing.id }
      }
      const id = `file-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const newTab: FileMainTab = { id, type: "file", ...tab }
      return { tabs: [...state.tabs, newTab], activeTabId: id }
    }),
  closeTab: (id) =>
    set((state) => {
      const idx = state.tabs.findIndex((tab) => tab.id === id)
      if (idx === -1) return state
      const tabs = state.tabs.filter((tab) => tab.id !== id)
      let activeTabId = state.activeTabId
      if (state.activeTabId === id) {
        activeTabId = tabs.length > 0 ? tabs[Math.max(0, idx - 1)].id : null
      }
      return { tabs, activeTabId }
    }),
  setActiveTab: (id) => set({ activeTabId: id }),
  updateThreadTitle: (threadId, title) =>
    set((state) => {
      const existing = state.tabs.find(
        (tab) => tab.type === "thread" && tab.threadId === threadId
      )
      if (!existing || existing.title === title) return state
      return {
        tabs: state.tabs.map((tab) =>
          tab.type === "thread" && tab.threadId === threadId
            ? { ...tab, title }
            : tab
        ),
      }
    }),
  reorderTabs: (draggedId, targetId, before) =>
    set((state) => {
      if (draggedId === targetId) return state
      const dragged = state.tabs.find((tab) => tab.id === draggedId)
      if (!dragged) return state
      const without = state.tabs.filter((tab) => tab.id !== draggedId)
      const targetIdx = without.findIndex((tab) => tab.id === targetId)
      if (targetIdx === -1) return state
      const insertAt = before ? targetIdx : targetIdx + 1
      const tabs = [
        ...without.slice(0, insertAt),
        dragged,
        ...without.slice(insertAt),
      ]
      return { tabs }
    }),
}))

interface MainTabsContextValue {
  tabs: MainTab[]
  activeTabId: string | null
  activeTab: MainTab | null
  addThreadTab: (threadId: string, title: string) => void
  addFileTab: (tab: Omit<FileMainTab, "id" | "type">) => void
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  updateThreadTitle: (threadId: string, title: string) => void
  reorderTabs: (draggedId: string, targetId: string, before: boolean) => void
}

export function MainTabsProvider({ children }: { children: ReactNode }) {
  const setInitialized = useMainTabsStore((state) => state.setInitialized)

  useEffect(() => {
    setInitialized(true)
    return () => setInitialized(false)
  }, [setInitialized])

  return <>{children}</>
}

export function useMainTabs(): MainTabsContextValue {
  const initialized = useMainTabsStore((state) => state.initialized)
  const tabs = useMainTabsStore((state) => state.tabs)
  const activeTabId = useMainTabsStore((state) => state.activeTabId)
  const addThreadTab = useMainTabsStore((state) => state.addThreadTab)
  const addFileTab = useMainTabsStore((state) => state.addFileTab)
  const closeTab = useMainTabsStore((state) => state.closeTab)
  const setActiveTab = useMainTabsStore((state) => state.setActiveTab)
  const updateThreadTitle = useMainTabsStore((state) => state.updateThreadTitle)
  const reorderTabs = useMainTabsStore((state) => state.reorderTabs)

  if (!initialized) {
    throw new Error("useMainTabs must be used within MainTabsProvider")
  }

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null

  return {
    tabs,
    activeTabId,
    activeTab,
    addThreadTab,
    addFileTab,
    closeTab,
    setActiveTab,
    updateThreadTitle,
    reorderTabs,
  }
}
