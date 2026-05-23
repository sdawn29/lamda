import { create } from "zustand"

export interface TerminalTab {
  id: string
  title: string
  cwd: string
  initialCommand?: string
}

export interface WorkspaceTerminalState {
  isOpen: boolean
  tabs: TerminalTab[]
  activeTabId: string | null
}

// Stable singleton — used as the selector fallback so Zustand's === check
// never sees a "new" object when a workspace has no state yet.
const DEFAULT_STATE: WorkspaceTerminalState = { isOpen: false, tabs: [], activeTabId: null }

function makeDefaultState(): WorkspaceTerminalState {
  return { isOpen: false, tabs: [], activeTabId: null }
}

// Module-level counters — never drive re-renders
const tabCounters: Record<string, number> = {}

function makeTab(workspaceId: string, cwd: string, initialCommand?: string): TerminalTab {
  const counter = (tabCounters[workspaceId] ?? 0) + 1
  tabCounters[workspaceId] = counter
  return { id: crypto.randomUUID(), title: `Terminal ${counter}`, cwd, initialCommand }
}

interface TerminalStore {
  states: Record<string, WorkspaceTerminalState>
  getState: (workspaceId: string) => WorkspaceTerminalState
  toggle: (workspaceId: string, cwd: string) => void
  open: (workspaceId: string, cwd: string) => void
  close: (workspaceId: string) => void
  addTab: (workspaceId: string, cwd: string) => string
  runCommand: (workspaceId: string, cwd: string, command: string) => string
  closeTab: (workspaceId: string, tabId: string) => void
  setActiveTab: (workspaceId: string, tabId: string) => void
  renameTab: (workspaceId: string, tabId: string, title: string) => void
  killAll: (workspaceId: string) => void
}

function updateWorkspace(
  states: Record<string, WorkspaceTerminalState>,
  workspaceId: string,
  fn: (prev: WorkspaceTerminalState) => WorkspaceTerminalState
): Record<string, WorkspaceTerminalState> {
  const current = states[workspaceId] ?? makeDefaultState()
  return { ...states, [workspaceId]: fn(current) }
}

export const useTerminalStore = create<TerminalStore>()((set, get) => ({
  states: {},

  getState: (workspaceId) => get().states[workspaceId] ?? makeDefaultState(),

  open: (workspaceId, cwd) => {
    const current = get().states[workspaceId] ?? makeDefaultState()
    if (current.tabs.length > 0) {
      set((s) => ({ states: updateWorkspace(s.states, workspaceId, (p) => ({ ...p, isOpen: true })) }))
    } else {
      const tab = makeTab(workspaceId, cwd)
      set((s) => ({
        states: updateWorkspace(s.states, workspaceId, () => ({
          isOpen: true,
          tabs: [tab],
          activeTabId: tab.id,
        })),
      }))
    }
  },

  toggle: (workspaceId, cwd) => {
    const current = get().states[workspaceId] ?? makeDefaultState()
    if (current.isOpen) {
      set((s) => ({ states: updateWorkspace(s.states, workspaceId, (p) => ({ ...p, isOpen: false })) }))
    } else if (current.tabs.length > 0) {
      set((s) => ({ states: updateWorkspace(s.states, workspaceId, (p) => ({ ...p, isOpen: true })) }))
    } else {
      const tab = makeTab(workspaceId, cwd)
      set((s) => ({
        states: updateWorkspace(s.states, workspaceId, () => ({
          isOpen: true,
          tabs: [tab],
          activeTabId: tab.id,
        })),
      }))
    }
  },

  close: (workspaceId) =>
    set((s) => ({
      states: updateWorkspace(s.states, workspaceId, (p) => ({ ...p, isOpen: false })),
    })),

  addTab: (workspaceId, cwd) => {
    const tab = makeTab(workspaceId, cwd)
    set((s) => ({
      states: updateWorkspace(s.states, workspaceId, (p) => ({
        ...p,
        tabs: [...p.tabs, tab],
        activeTabId: tab.id,
      })),
    }))
    return tab.id
  },

  runCommand: (workspaceId, cwd, command) => {
    const tab = makeTab(workspaceId, cwd, command)
    set((s) => ({
      states: updateWorkspace(s.states, workspaceId, (p) => ({
        ...p,
        isOpen: true,
        tabs: [...p.tabs, tab],
        activeTabId: tab.id,
      })),
    }))
    return tab.id
  },

  closeTab: (workspaceId, tabId) =>
    set((s) => ({
      states: updateWorkspace(s.states, workspaceId, (p) => {
        const idx = p.tabs.findIndex((t) => t.id === tabId)
        if (idx === -1) return p
        const next = p.tabs.filter((t) => t.id !== tabId)
        if (next.length === 0) return { ...p, tabs: [], isOpen: false, activeTabId: null }
        const newActive =
          p.activeTabId === tabId ? next[idx > 0 ? idx - 1 : 0].id : p.activeTabId
        return { ...p, tabs: next, activeTabId: newActive }
      }),
    })),

  setActiveTab: (workspaceId, tabId) =>
    set((s) => ({
      states: updateWorkspace(s.states, workspaceId, (p) => ({ ...p, activeTabId: tabId })),
    })),

  renameTab: (workspaceId, tabId, title) =>
    set((s) => ({
      states: updateWorkspace(s.states, workspaceId, (p) => ({
        ...p,
        tabs: p.tabs.map((t) => (t.id === tabId ? { ...t, title } : t)),
      })),
    })),

  killAll: (workspaceId) => {
    delete tabCounters[workspaceId]
    set((s) => ({
      states: updateWorkspace(s.states, workspaceId, () => makeDefaultState()),
    }))
  },
}))

export function useTerminal() {
  return useTerminalStore()
}

export function useTerminalForWorkspace(workspaceId: string, cwd: string) {
  const state = useTerminalStore((s) => s.states[workspaceId] ?? DEFAULT_STATE)
  const store = useTerminalStore.getState
  return {
    isOpen: state.isOpen,
    tabs: state.tabs,
    activeTabId: state.activeTabId,
    toggle: () => store().toggle(workspaceId, cwd),
    open: () => store().open(workspaceId, cwd),
    close: () => store().close(workspaceId),
    addTab: () => store().addTab(workspaceId, cwd),
    runCommand: (command: string) => store().runCommand(workspaceId, cwd, command),
    closeTab: (tabId: string) => store().closeTab(workspaceId, tabId),
    setActiveTab: (tabId: string) => store().setActiveTab(workspaceId, tabId),
    renameTab: (tabId: string, title: string) => store().renameTab(workspaceId, tabId, title),
    killAll: () => store().killAll(workspaceId),
  }
}
