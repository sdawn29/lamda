import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from "react"

export interface DiffPanelTab {
  id: string
  title: string
  type: "source-control" | "file"
  filePath?: string
}

interface DiffPanelState {
  isOpen: boolean
  isFullscreen: boolean
  tabs: DiffPanelTab[]
  activeTabId: string | null
  pendingTabId: string | null
  currentWorkspacePath: string | null
  workspaceTabs: Record<string, DiffPanelTab[]>
}

type DiffPanelAction =
  | { type: "OPEN" }
  | { type: "CLOSE" }
  | { type: "TOGGLE" }
  | { type: "TOGGLE_FULLSCREEN" }
  | { type: "ADD_TAB"; payload: Omit<DiffPanelTab, "id"> }
  | { type: "CLOSE_TAB"; payload: string }
  | { type: "SET_ACTIVE_TAB"; payload: string }
  | { type: "CLEAR_PENDING_TAB" }
  | { type: "RENAME_TAB"; payload: { id: string; title: string } }
  | { type: "SET_WORKSPACE"; payload: string | null }

const SOURCE_CONTROL_TAB: DiffPanelTab = {
  id: "tab-source-control",
  title: "Source Control",
  type: "source-control",
}

const initialState: DiffPanelState = {
  isOpen: false,
  isFullscreen: false,
  tabs: [SOURCE_CONTROL_TAB],
  activeTabId: "tab-source-control",
  pendingTabId: null,
  currentWorkspacePath: null,
  workspaceTabs: {},
}

function diffPanelReducer(state: DiffPanelState, action: DiffPanelAction): DiffPanelState {
  switch (action.type) {
    case "OPEN":
      return { ...state, isOpen: true }

    case "CLOSE":
      return { ...state, isOpen: false, isFullscreen: false }

    case "TOGGLE":
      return {
        ...state,
        isOpen: !state.isOpen,
        isFullscreen: !state.isOpen ? state.isFullscreen : false,
      }

    case "TOGGLE_FULLSCREEN":
      return { ...state, isFullscreen: !state.isFullscreen }

    case "ADD_TAB": {
      const tab = action.payload
      if (tab.type === "source-control") {
        return state
      }

      // Check if file already exists
      if (tab.filePath) {
        const existingTab = state.tabs.find((t) => t.filePath === tab.filePath)
        if (existingTab) {
          return {
            ...state,
            activeTabId: existingTab.id,
            pendingTabId: existingTab.id,
          }
        }
      }

      const id = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const newTab = { ...tab, id }
      const newTabs = [...state.tabs, newTab]

      // Save to workspace tabs
      let workspaceTabs = state.workspaceTabs
      if (state.currentWorkspacePath) {
        const fileTabs = newTabs.filter((t) => t.type === "file")
        workspaceTabs = {
          ...state.workspaceTabs,
          [state.currentWorkspacePath]: fileTabs,
        }
      }

      return {
        ...state,
        tabs: newTabs,
        activeTabId: id,
        pendingTabId: id,
        workspaceTabs,
      }
    }

    case "CLOSE_TAB": {
      const id = action.payload
      const tab = state.tabs.find((t) => t.id === id)

      // Prevent closing Source Control tab
      if (tab?.type === "source-control") {
        return state
      }

      const newTabs = state.tabs.filter((t) => t.id !== id)

      // If no tabs left, reset to Source Control
      if (newTabs.length === 0) {
        return {
          ...state,
          tabs: [SOURCE_CONTROL_TAB],
          activeTabId: SOURCE_CONTROL_TAB.id,
        }
      }

      // If closing active tab, switch to adjacent tab
      let newActiveTabId = state.activeTabId
      if (state.activeTabId === id) {
        const closedIndex = state.tabs.findIndex((t) => t.id === id)
        const newActiveIndex = Math.max(0, closedIndex - 1)
        newActiveTabId = newTabs[newActiveIndex].id
      }

      // Update workspace tabs
      let workspaceTabs = state.workspaceTabs
      if (state.currentWorkspacePath) {
        const fileTabs = newTabs.filter((t) => t.type === "file")
        workspaceTabs = {
          ...state.workspaceTabs,
          [state.currentWorkspacePath]: fileTabs,
        }
      }

      return {
        ...state,
        tabs: newTabs,
        activeTabId: newActiveTabId,
        workspaceTabs,
      }
    }

    case "SET_ACTIVE_TAB":
      return { ...state, activeTabId: action.payload }

    case "CLEAR_PENDING_TAB":
      return { ...state, pendingTabId: null }

    case "RENAME_TAB":
      return {
        ...state,
        tabs: state.tabs.map((t) =>
          t.id === action.payload.id ? { ...t, title: action.payload.title } : t
        ),
      }

    case "SET_WORKSPACE": {
      const path = action.payload

      // Save current file tabs before switching
      let workspaceTabs = state.workspaceTabs
      if (state.currentWorkspacePath) {
        const fileTabs = state.tabs.filter((t) => t.type === "file")
        if (fileTabs.length > 0) {
          workspaceTabs = {
            ...state.workspaceTabs,
            [state.currentWorkspacePath]: fileTabs,
          }
        }
      }

      // Switch to new workspace
      if (path) {
        const savedTabs = workspaceTabs[path] || []
        if (savedTabs.length > 0) {
          return {
            ...state,
            workspaceTabs,
            currentWorkspacePath: path,
            tabs: [SOURCE_CONTROL_TAB, ...savedTabs],
            activeTabId: savedTabs[0].id,
          }
        }
      }

      return {
        ...state,
        workspaceTabs,
        currentWorkspacePath: path,
        tabs: [SOURCE_CONTROL_TAB],
        activeTabId: SOURCE_CONTROL_TAB.id,
      }
    }

    default:
      return state
  }
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
  pendingTabId: string | null
  addTab: (tab: Omit<DiffPanelTab, "id">) => void
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  clearPendingTab: () => void
  renameTab: (id: string, title: string) => void
  currentWorkspacePath: string | null
  setCurrentWorkspace: (path: string | null) => void
}

const DiffPanelContext = createContext<DiffPanelContextValue | null>(null)

export function DiffPanelProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(diffPanelReducer, initialState)

  const toggle = useCallback(() => dispatch({ type: "TOGGLE" }), [])
  const open = useCallback(() => dispatch({ type: "OPEN" }), [])
  const close = useCallback(() => dispatch({ type: "CLOSE" }), [])
  const toggleFullscreen = useCallback(() => dispatch({ type: "TOGGLE_FULLSCREEN" }), [])
  const addTab = useCallback((tab: Omit<DiffPanelTab, "id">) => dispatch({ type: "ADD_TAB", payload: tab }), [])
  const closeTab = useCallback((id: string) => dispatch({ type: "CLOSE_TAB", payload: id }), [])
  const setActiveTab = useCallback((id: string) => dispatch({ type: "SET_ACTIVE_TAB", payload: id }), [])
  const clearPendingTab = useCallback(() => dispatch({ type: "CLEAR_PENDING_TAB" }), [])
  const renameTab = useCallback((id: string, title: string) => dispatch({ type: "RENAME_TAB", payload: { id, title } }), [])
  const setCurrentWorkspace = useCallback((path: string | null) => dispatch({ type: "SET_WORKSPACE", payload: path }), [])

  const value = useMemo(
    () => ({
      isOpen: state.isOpen,
      toggle,
      open,
      close,
      isFullscreen: state.isFullscreen,
      toggleFullscreen,
      tabs: state.tabs,
      activeTabId: state.activeTabId,
      pendingTabId: state.pendingTabId,
      addTab,
      closeTab,
      setActiveTab,
      clearPendingTab,
      renameTab,
      currentWorkspacePath: state.currentWorkspacePath,
      setCurrentWorkspace,
    }),
    [state, toggle, open, close, toggleFullscreen, addTab, closeTab, setActiveTab, clearPendingTab, renameTab, setCurrentWorkspace]
  )

  return <DiffPanelContext value={value}>{children}</DiffPanelContext>
}

export function useDiffPanel() {
  const ctx = useContext(DiffPanelContext)
  if (!ctx)
    throw new Error("useDiffPanel must be used within DiffPanelProvider")
  return ctx
}
