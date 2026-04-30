import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

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

const TerminalContext = createContext<TerminalContextValue | null>(null)

export function TerminalProvider({ children }: { children: ReactNode }) {
  const [states, setStates] = useState<Map<string, WorkspaceTerminalState>>(
    () => new Map()
  )

  // Per-workspace tab counters (only incremented when a tab is actually created)
  const tabCounters = useRef<Map<string, number>>(new Map())

  const getState = useCallback(
    (workspaceId: string) => states.get(workspaceId) ?? makeDefaultState(),
    [states]
  )

  const getAllStates = useCallback(() => states, [states])

  const update = useCallback(
    (workspaceId: string, fn: (prev: WorkspaceTerminalState) => WorkspaceTerminalState) => {
      setStates((prev) => {
        const current = prev.get(workspaceId) ?? makeDefaultState()
        const next = fn(current)
        const m = new Map(prev)
        m.set(workspaceId, next)
        return m
      })
    },
    []
  )

  const makeTab = useCallback((workspaceId: string, cwd: string): TerminalTab => {
    const counter = (tabCounters.current.get(workspaceId) ?? 0) + 1
    tabCounters.current.set(workspaceId, counter)
    return { id: crypto.randomUUID(), title: `Terminal ${counter}`, cwd }
  }, [])

  // `states` is in the dep arrays of open/toggle so the callbacks close over the current
  // map and can read it synchronously — no ref needed, no render-time mutations.
  const open = useCallback(
    (workspaceId: string, cwd: string) => {
      const current = states.get(workspaceId) ?? makeDefaultState()
      if (current.tabs.length > 0) {
        update(workspaceId, (prev) => ({ ...prev, isOpen: true }))
      } else {
        const tab = makeTab(workspaceId, cwd)
        update(workspaceId, () => ({ isOpen: true, tabs: [tab], activeTabId: tab.id }))
      }
    },
    [states, update, makeTab]
  )

  const toggle = useCallback(
    (workspaceId: string, cwd: string) => {
      const current = states.get(workspaceId) ?? makeDefaultState()
      if (current.isOpen) {
        update(workspaceId, (prev) => ({ ...prev, isOpen: false }))
      } else if (current.tabs.length > 0) {
        update(workspaceId, (prev) => ({ ...prev, isOpen: true }))
      } else {
        const tab = makeTab(workspaceId, cwd)
        update(workspaceId, () => ({ isOpen: true, tabs: [tab], activeTabId: tab.id }))
      }
    },
    [states, update, makeTab]
  )

  const close = useCallback(
    (workspaceId: string) => {
      update(workspaceId, (prev) => ({ ...prev, isOpen: false }))
    },
    [update]
  )

  const addTab = useCallback(
    (workspaceId: string, cwd: string): string => {
      const tab = makeTab(workspaceId, cwd)
      update(workspaceId, (prev) => ({
        ...prev,
        tabs: [...prev.tabs, tab],
        activeTabId: tab.id,
      }))
      return tab.id
    },
    [update, makeTab]
  )

  const closeTab = useCallback(
    (workspaceId: string, tabId: string) => {
      update(workspaceId, (prev) => {
        const idx = prev.tabs.findIndex((t) => t.id === tabId)
        if (idx === -1) return prev
        const next = prev.tabs.filter((t) => t.id !== tabId)
        if (next.length === 0) return { ...prev, tabs: [], isOpen: false, activeTabId: null }
        const newActive =
          prev.activeTabId === tabId ? next[idx > 0 ? idx - 1 : 0].id : prev.activeTabId
        return { ...prev, tabs: next, activeTabId: newActive }
      })
    },
    [update]
  )

  const setActiveTab = useCallback(
    (workspaceId: string, tabId: string) => {
      update(workspaceId, (prev) => ({ ...prev, activeTabId: tabId }))
    },
    [update]
  )

  const renameTab = useCallback(
    (workspaceId: string, tabId: string, title: string) => {
      update(workspaceId, (prev) => ({
        ...prev,
        tabs: prev.tabs.map((t) => (t.id === tabId ? { ...t, title } : t)),
      }))
    },
    [update]
  )

  const killAll = useCallback(
    (workspaceId: string) => {
      tabCounters.current.delete(workspaceId)
      update(workspaceId, () => makeDefaultState())
    },
    [update]
  )

  const value = useMemo(
    () => ({
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
    }),
    [getState, getAllStates, toggle, open, close, addTab, closeTab, setActiveTab, renameTab, killAll]
  )

  return <TerminalContext value={value}>{children}</TerminalContext>
}

export function useTerminal() {
  const ctx = useContext(TerminalContext)
  if (!ctx) throw new Error("useTerminal must be used within TerminalProvider")
  return ctx
}

export function useTerminalForWorkspace(workspaceId: string, cwd: string) {
  const ctx = useTerminal()
  const state = ctx.getState(workspaceId)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx, workspaceId, cwd, state]
  )
}
