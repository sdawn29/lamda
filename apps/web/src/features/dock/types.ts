import type { ReactNode } from "react"

export type DockId = "right" | "bottom"

/** File selection rendered inside the singleton Files panel. */
export interface FileTabPayload {
  filePath: string
  workspacePath?: string
  openWithAppId?: string | null
  scrollToLine?: number
  /**
   * When set, the viewer loads the file bytes from this fully-qualified,
   * token-appended URL instead of `/file?path=`. Used for chat attachments,
   * which live outside any workspace directory.
   */
  sourceUrl?: string
}

export interface FilePreview extends FileTabPayload {
  id: string
  title: string
}

export interface DockTab {
  id: string
  /** Key into the panel registry (features/dock/panels.tsx). */
  type: string
  title: string
}

/**
 * Everything the three panel types need to render, computed once in
 * workspace-layout.tsx from the active thread/workspace and handed to both
 * dock zones. Intentionally a flat bag of the exact fields the panels read —
 * no more.
 */
export interface DockPanelContext {
  sessionId: string | null
  workspaceSessionId: string | null
  workspaceId: string | null
  workspacePath: string | null
  openWithAppId: string | null
  /** Active thread id — lets the file tree read the thread's worktree dir. */
  treeThreadId: string | null
  /** Workspace whose PTY tabs the terminal panel currently displays. */
  terminalWorkspaceId: string | null
  terminalCwd: string | null
}

export interface DockPanelDefinition {
  type: string
  /** Human-readable name — the picker entry and the default tab title. */
  label: string
  /** Only one tab of this type may exist across both docks. */
  singleton: boolean
  /** Content stays mounted (display:none) while another tab in its dock is active. */
  keepAlive: boolean
  defaultDock: DockId
  /** When defined and false for the current context, the empty-dock picker omits this panel. */
  isAvailable?: (ctx: DockPanelContext) => boolean
  icon: (tab: DockTab) => ReactNode
  render: (tab: DockTab, ctx: DockPanelContext) => ReactNode
  /** Rendered in the dock header, only for the active tab. */
  headerActions?: (tab: DockTab, ctx: DockPanelContext) => ReactNode
}
