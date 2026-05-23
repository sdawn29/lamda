import { useEffect, useMemo, useRef, type ReactNode } from "react"
import { create } from "zustand"

export interface TerminalTab {
  id: string
  title: string
  cwd: string
}

interface WorkspaceTerminalState {
  isOpen: boolean
  tabs: TerminalTab[]
  activeTabId: string | null
}

function makeDefaultState(): WorkspaceTerminalState {
  return { isOpen: false, tabs: [], activeTabId: null }
}

interface TerminalStore {
  initialized: boolean
  states: Map<string, WorkspaceTerminalState>
  setInitialized: (value: boolean) => void
  setStates: (updater: (prev: Map<string, WorkspaceTerminalState>) => Map<string, WorkspaceTerminalState>) => void
}

const useTerminalStore = create<TerminalStore>((set) => ({
  initialized: false,
  states: new Map(),
  setInitialized: (value) => set({ initialized: value }),
  setStates: (updater) => set((state) => ({ states: updater(state.states) })),
}))

interface TerminalContextValue {
  getState: (workspaceId: string) => WorkspaceTerminalState
  getAllStates: () => Map<string, WorkspaceTerminalState>
  toggle: (workspaceId: string, cwd: string) => void
  open: (workspaceId: string, cwd: string) => void
  close: (workspaceId: string) => void
  addTab: (workspaceId: string, cwd: string) => string
  closeTab: (workspaceId: string, tabId: string) => void
  setActiveTab: (workspaceId: string, tabId: string) => void
  renameTab: (workspaceId: string, tabId: string, title: string) => void
  killAll: (workspaceId: string) => void
}

export function TerminalProvider({ children }: { children: ReactNode }) {
  const tabCounters = useRef<Map<string, number>>(new Map())
  const states = useTerminalStore((state) => state.states)
  const setInitialized = useTerminalStore((state) => state.setInitialized)
  const setStates = useTerminalStore((state) => state.setStates)

  useEffect(() => {
    setInitialized(true)
    return () => setInitialized(false)
  }, [setInitialized])

  const getState = (workspaceId: string): WorkspaceTerminalState =>
    states.get(workspaceId) ?? makeDefaultState()

  const getAllStates = () => states

  const update = (
    workspaceId: string,
    fn: (prev: WorkspaceTerminalState) => WorkspaceTerminalState
  ) => {
    setStates((prevStates) => {
      const current = prevStates.get(workspaceId) ?? makeDefaultState()
      const next = fn(current)
      const map = new Map(prevStates)
      map.set(workspaceId, next)
      return map
    })
  }

  const makeTab = (workspaceId: string, cwd: string): TerminalTab => {
    const counter = (tabCounters.current.get(workspaceId) ?? 0) + 1
    tabCounters.current.set(workspaceId, counter)
    return { id: crypto.randomUUID(), title: `Terminal ${counter}`, cwd }
  }

  const open = (workspaceId: string, cwd: string) => {
    const current = states.get(workspaceId) ?? makeDefaultState()
    if (current.tabs.length > 0) {
      update(workspaceId, (prev) => ({ ...prev, isOpen: true }))
    } else {
      const tab = makeTab(workspaceId, cwd)
      update(workspaceId, () => ({ isOpen: true, tabs: [tab], activeTabId: tab.id }))
    }
  }

  const toggle = (workspaceId: string, cwd: string) => {
    const current = states.get(workspaceId) ?? makeDefaultState()
    if (current.isOpen) {
      update(workspaceId, (prev) => ({ ...prev, isOpen: false }))
    } else if (current.tabs.length > 0) {
      update(workspaceId, (prev) => ({ ...prev, isOpen: true }))
    } else {
      const tab = makeTab(workspaceId, cwd)
      update(workspaceId, () => ({ isOpen: true, tabs: [tab], activeTabId: tab.id }))
    }
  }

  const close = (workspaceId: string) => {
    update(workspaceId, (prev) => ({ ...prev, isOpen: false }))
  }

  const addTab = (workspaceId: string, cwd: string): string => {
    const tab = makeTab(workspaceId, cwd)
    update(workspaceId, (prev) => ({
      ...prev,
      tabs: [...prev.tabs, tab],
      activeTabId: tab.id,
    }))
    return tab.id
  }

  const closeTab = (workspaceId: string, tabId: string) => {
    update(workspaceId, (prev) => {
      const idx = prev.tabs.findIndex((tab) => tab.id === tabId)
      if (idx === -1) return prev
      const tabs = prev.tabs.filter((tab) => tab.id !== tabId)
      if (tabs.length === 0) return { ...prev, tabs: [], isOpen: false, activeTabId: null }
      const activeTabId =
        prev.activeTabId === tabId ? tabs[idx > 0 ? idx - 1 : 0].id : prev.activeTabId
      return { ...prev, tabs, activeTabId }
    })
  }

  const setActiveTab = (workspaceId: string, tabId: string) => {
    update(workspaceId, (prev) => ({ ...prev, activeTabId: tabId }))
  }

  const renameTab = (workspaceId: string, tabId: string, title: string) => {
    update(workspaceId, (prev) => ({
      ...prev,
      tabs: prev.tabs.map((tab) => (tab.id === tabId ? { ...tab, title } : tab)),
    }))
  }

  const killAll = (workspaceId: string) => {
    tabCounters.current.delete(workspaceId)
    update(workspaceId, () => makeDefaultState())
  }

  const value: TerminalContextValue = {
    getState,
    getAllStates,
    toggle,
    open,
    close,
    addTab,
    closeTab,
    setActiveTab,
    renameTab,
    killAll,
  }

  return <TerminalContextBridge value={value}>{children}</TerminalContextBridge>
}

interface TerminalContextBridgeProps {
  value: TerminalContextValue
  children: ReactNode
}

interface TerminalBridgeStore {
  value: TerminalContextValue | null
  setValue: (value: TerminalContextValue | null) => void
}

const useTerminalBridgeStore = create<TerminalBridgeStore>((set) => ({
  value: null,
  setValue: (value) => set({ value }),
}))

function TerminalContextBridge({ value, children }: TerminalContextBridgeProps) {
  const setValue = useTerminalBridgeStore((state) => state.setValue)

  useEffect(() => {
    setValue(value)
    return () => setValue(null)
  }, [setValue, value])

  return <>{children}</>
}

export function useTerminal() {
  const initialized = useTerminalStore((state) => state.initialized)
  const value = useTerminalBridgeStore((state) => state.value)
  if (!initialized || !value) {
    throw new Error("useTerminal must be used within TerminalProvider")
  }
  return value
}

export function useTerminalForWorkspace(workspaceId: string, cwd: string) {
  const ctx = useTerminal()
  const state = useTerminalStore((store) => store.states.get(workspaceId) ?? makeDefaultState())

  return useMemo(
    () => ({
      isOpen: state.isOpen,
      tabs: state.tabs,
      activeTabId: state.activeTabId,
      toggle: () => ctx.toggle(workspaceId, cwd),
      open: () => ctx.open(workspaceId, cwd),
      close: () => ctx.close(workspaceId),
      addTab: () => ctx.addTab(workspaceId, cwd),
      closeTab: (tabId: string) => ctx.closeTab(workspaceId, tabId),
      setActiveTab: (tabId: string) => ctx.setActiveTab(workspaceId, tabId),
      renameTab: (tabId: string, title: string) => ctx.renameTab(workspaceId, tabId, title),
      killAll: () => ctx.killAll(workspaceId),
    }),
    [ctx, workspaceId, cwd, state]
  )
}
