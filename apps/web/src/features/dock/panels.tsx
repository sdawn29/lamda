import { lazy, Suspense, useRef, useState } from "react"
import {
  Bot,
  FileDiff,
  FolderTree,
  History,
  TerminalSquare,
  X,
} from "lucide-react"
import { Icon } from "@iconify/react"
import { Github } from "@lobehub/icons"
import { Button } from "@/shared/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip"
import { getIconName } from "@/shared/ui/file-icon"
import { cn } from "@/shared/lib/utils"
import { useShortcutBinding } from "@/shared/components/keyboard-shortcuts-provider"
import { SHORTCUT_ACTIONS } from "@/shared/lib/keyboard-shortcuts"
import { ShortcutKbd } from "@/shared/ui/kbd"
import { useTerminalStore } from "@/features/terminal/store"
import { useBranch } from "@/features/git/queries"
import { GitlabLogo } from "@/features/gitlab/components/gitlab-logo"
import { useDockStore, openFileTab } from "./store"
import type { DockId, DockPanelContext, DockPanelDefinition } from "./types"

const ReviewPanel = lazy(() =>
  import("@/features/git").then((m) => ({ default: m.ReviewPanel }))
)
const HistoryView = lazy(() =>
  import("@/features/git").then((m) => ({ default: m.HistoryView }))
)
const TerminalPanel = lazy(() =>
  import("@/features/terminal").then((m) => ({ default: m.TerminalPanel }))
)
const FileContentView = lazy(() =>
  import("@/features/main-tabs").then((m) => ({ default: m.FileContentView }))
)
const SubagentDockPanel = lazy(() =>
  import("@/features/chat/components/subagent-panel").then((m) => ({
    default: m.SubagentDockPanel,
  }))
)
const GithubPanel = lazy(() =>
  import("@/features/github").then((m) => ({ default: m.GithubReviewView }))
)
const GitlabPanel = lazy(() =>
  import("@/features/gitlab").then((m) => ({ default: m.GitlabReviewView }))
)

const FILE_TAB_MIME = "application/x-files-panel-tab"

function GithubDockPanel({ sessionId }: { sessionId: string }) {
  const { data: branch } = useBranch(sessionId)
  return (
    <Suspense fallback={<div className="h-full bg-background" />}>
      <GithubPanel sessionId={sessionId} branch={branch?.branch ?? null} />
    </Suspense>
  )
}

function GitlabDockPanel({ sessionId }: { sessionId: string }) {
  const { data: branch } = useBranch(sessionId)
  return (
    <Suspense fallback={<div className="h-full bg-background" />}>
      <GitlabPanel sessionId={sessionId} branch={branch?.branch ?? null} />
    </Suspense>
  )
}
// Review and Files both host the file-tree overlay drawer in dock-zone.tsx.
function FileTreeToggleAction({ label }: { label: string }) {
  const fileTreeOpen = useDockStore((s) => s.fileTreeOpen)
  const toggleFileTree = useDockStore((s) => s.toggleFileTree)
  const fileTreeBinding = useShortcutBinding(SHORTCUT_ACTIONS.TOGGLE_FILE_TREE)
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggleFileTree}
            aria-pressed={fileTreeOpen}
            className="size-7 text-muted-foreground/60 hover:bg-accent hover:text-foreground aria-pressed:bg-accent aria-pressed:text-accent-foreground"
          >
            <FolderTree className="size-3.5" />
            <span className="sr-only">Toggle {label}</span>
          </Button>
        }
      />
      <TooltipContent>
        Toggle {label}
        <ShortcutKbd binding={fileTreeBinding} className="ml-1" />
      </TooltipContent>
    </Tooltip>
  )
}

// The Files panel owns navigation and its internal file tabs. Files never
// become standalone dock tabs.
function FilesPanel({ ctx }: { ctx: DockPanelContext }) {
  const filePreviews = useDockStore((s) => s.filePreviews)
  const activeFilePreviewId = useDockStore((s) => s.activeFilePreviewId)
  const closeFilePreview = useDockStore((s) => s.closeFilePreview)
  const setActiveFilePreview = useDockStore((s) => s.setActiveFilePreview)
  const reorderFilePreview = useDockStore((s) => s.reorderFilePreview)
  const toggleFileTree = useDockStore((s) => s.toggleFileTree)
  const draggedFileId = useRef<string | null>(null)
  const [fileDropTarget, setFileDropTarget] = useState<{
    id: string
    before: boolean
  } | null>(null)
  const workspacePath = ctx.workspacePath
  const filePreview =
    filePreviews.find((file) => file.id === activeFilePreviewId) ??
    filePreviews[0]

  if (!filePreview) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <FolderTree className="size-5" aria-hidden />
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-foreground">No file open</p>
          <p className="max-w-56 text-xs text-muted-foreground">
            Browse the file tree and select a file to open it here.
          </p>
        </div>
        {ctx.workspaceId && workspacePath && (
          <Button variant="outline" size="sm" onClick={toggleFileTree}>
            <FolderTree data-icon="inline-start" />
            Open file tree
          </Button>
        )}
      </div>
    )
  }

  return (
    <Tabs
      value={filePreview.id}
      onValueChange={setActiveFilePreview}
      className="h-full min-w-0 gap-0 overflow-hidden"
    >
      <TabsList
        variant="line"
        className="h-9 w-full max-w-full shrink-0 justify-start gap-0 overflow-x-auto rounded-none border-b border-border/50 bg-transparent px-2 py-0"
      >
        {filePreviews.map((file) => {
          const isActive = file.id === filePreview.id
          const dropBefore =
            fileDropTarget?.id === file.id && fileDropTarget.before
          const dropAfter =
            fileDropTarget?.id === file.id && !fileDropTarget.before
          return (
            <div
              key={file.id}
              draggable
              onDragStart={(event) => {
                draggedFileId.current = file.id
                event.dataTransfer.effectAllowed = "move"
                event.dataTransfer.setData(FILE_TAB_MIME, file.id)
                event.dataTransfer.setData("text/plain", file.id)
              }}
              onDragEnd={() => {
                draggedFileId.current = null
                setFileDropTarget(null)
              }}
              onDragOver={(event) => {
                if (!event.dataTransfer.types.includes(FILE_TAB_MIME)) return
                event.preventDefault()
                event.dataTransfer.dropEffect = "move"
                const rect = event.currentTarget.getBoundingClientRect()
                setFileDropTarget({
                  id: file.id,
                  before: event.clientX < rect.left + rect.width / 2,
                })
              }}
              onDrop={(event) => {
                event.preventDefault()
                const draggedId =
                  event.dataTransfer.getData(FILE_TAB_MIME) ||
                  draggedFileId.current
                if (draggedId && draggedId !== file.id) {
                  const rect = event.currentTarget.getBoundingClientRect()
                  reorderFilePreview(
                    draggedId,
                    file.id,
                    event.clientX < rect.left + rect.width / 2
                  )
                }
                draggedFileId.current = null
                setFileDropTarget(null)
              }}
              className={cn(
                "flex h-8 max-w-56 shrink-0 cursor-grab items-center rounded-t-lg border border-b-0 border-transparent text-xs active:cursor-grabbing",
                isActive &&
                  "border-border/60 bg-background text-foreground shadow-sm",
                dropBefore && "border-l-2 border-l-primary",
                dropAfter && "border-r-2 border-r-primary"
              )}
            >
              <TabsTrigger
                value={file.id}
                className="h-full min-w-0 flex-1 justify-start rounded-none bg-transparent px-2 after:hidden data-active:bg-transparent"
              >
                <Icon
                  icon={`catppuccin:${getIconName(file.title)}`}
                  className="size-3.5 shrink-0"
                  aria-hidden
                />
                <span className="truncate">{file.title}</span>
              </TabsTrigger>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => closeFilePreview(file.id)}
                aria-label={`Close ${file.title}`}
                className="mr-1 text-muted-foreground/60 hover:text-foreground"
              >
                <X data-icon="inline-start" />
              </Button>
            </div>
          )
        })}
      </TabsList>

      {filePreviews.map((file) => (
        <TabsContent
          key={file.id}
          value={file.id}
          className="min-h-0 flex-1 overflow-hidden"
        >
          {file.id === filePreview.id ? (
            <Suspense fallback={<div className="h-full bg-background" />}>
              <FileContentView
                variant="panel"
                filePath={file.filePath}
                openWithAppId={
                  file.openWithAppId ?? ctx.openWithAppId ?? undefined
                }
                workspacePath={
                  file.sourceUrl
                    ? file.workspacePath
                    : (file.workspacePath ?? workspacePath ?? undefined)
                }
                initialScrollToLine={file.scrollToLine}
                sourceUrl={file.sourceUrl}
                onOpenFile={(filePath, title, scrollToLine) =>
                  openFileTab({
                    filePath,
                    title,
                    workspacePath: file.workspacePath,
                    scrollToLine,
                  })
                }
              />
            </Suspense>
          ) : null}
        </TabsContent>
      ))}
    </Tabs>
  )
}

/**
 * The panel registry — the only place that knows how to render each tab
 * type. Adding a new dockable panel means adding an entry here (and, if
 * it needs new context, extending DockPanelContext in types.ts).
 */
export const PANELS: Record<string, DockPanelDefinition> = {
  review: {
    type: "review",
    label: "Review",
    description: "Diffs and commit history for this thread",
    singleton: true,
    keepAlive: false,
    defaultDock: "right",
    icon: () => <FileDiff className="size-3.5 shrink-0" aria-hidden />,
    render: (_tab, ctx) => {
      if (ctx.sessionId) {
        return (
          <ReviewPanel
            sessionId={ctx.sessionId}
            workspaceSessionId={ctx.workspaceSessionId ?? ctx.sessionId}
          />
        )
      }
      if (ctx.workspaceId) {
        // No live session — fall back to workspace-level commit history so
        // the panel is still useful on the new-thread page.
        return (
          <div className="flex h-full flex-col">
            <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-border/40 px-3 text-xs font-medium text-sidebar-foreground/70">
              <History className="size-3.5" />
              Commit history
            </div>
            <HistoryView sessionId="" workspaceId={ctx.workspaceId} />
          </div>
        )
      }
      return (
        <div className="flex h-full items-center justify-center text-xs text-sidebar-foreground/40">
          No active session
        </div>
      )
    },
    headerActions: (_tab, ctx) =>
      ctx.workspaceId && ctx.workspacePath ? (
        <FileTreeToggleAction label="modified files" />
      ) : null,
  },

  terminal: {
    type: "terminal",
    label: "Terminal",
    description: "Shell sessions in this workspace",
    singleton: true,
    // PTY sessions stay connected while the terminal tab isn't active/visible.
    keepAlive: true,
    defaultDock: "bottom",
    isAvailable: (ctx) => !!ctx.terminalWorkspaceId,
    icon: () => <TerminalSquare className="size-3.5 shrink-0" aria-hidden />,
    render: (_tab, ctx) =>
      ctx.terminalWorkspaceId ? (
        <TerminalPanel
          activeWorkspaceId={ctx.terminalWorkspaceId}
          cwd={ctx.terminalCwd ?? ""}
        />
      ) : null,
    // The inner PTY tab bar already has its own new-tab/kill controls.
  },

  subagents: {
    type: "subagents",
    label: "Subagents",
    description: "Live subagent runs and transcripts",
    singleton: true,
    keepAlive: false,
    defaultDock: "right",
    isAvailable: (ctx) => !!ctx.sessionId,
    icon: () => <Bot className="size-3.5 shrink-0" aria-hidden />,
    render: (_tab, ctx) =>
      ctx.sessionId ? (
        <Suspense fallback={<div className="h-full bg-background" />}>
          <SubagentDockPanel
            sessionId={ctx.sessionId}
            rootPath={ctx.workspacePath ?? undefined}
          />
        </Suspense>
      ) : null,
  },

  github: {
    type: "github",
    label: "GitHub",
    description: "Pull request details and comments",
    singleton: true,
    keepAlive: false,
    defaultDock: "right",
    isAvailable: (ctx) => !!ctx.sessionId && ctx.githubConnected,
    icon: () => <Github size={14} />,
    render: (_tab, ctx) =>
      ctx.sessionId ? <GithubDockPanel sessionId={ctx.sessionId} /> : null,
  },

  gitlab: {
    type: "gitlab",
    label: "GitLab",
    description: "Merge request details and comments",
    singleton: true,
    keepAlive: false,
    defaultDock: "right",
    isAvailable: (ctx) => !!ctx.sessionId && ctx.gitlabConnected,
    icon: () => <GitlabLogo className="size-3.5 shrink-0" />,
    render: (_tab, ctx) =>
      ctx.sessionId ? <GitlabDockPanel sessionId={ctx.sessionId} /> : null,
  },

  files: {
    type: "files",
    label: "Files",
    description: "Browse and open workspace files",
    singleton: true,
    keepAlive: false,
    defaultDock: "right",
    isAvailable: (ctx) => !!ctx.workspaceId && !!ctx.workspacePath,
    icon: () => <FolderTree className="size-3.5 shrink-0" aria-hidden />,
    render: (_tab, ctx) => <FilesPanel ctx={ctx} />,
    headerActions: (_tab, ctx) =>
      ctx.workspaceId && ctx.workspacePath ? (
        <FileTreeToggleAction label="file tree" />
      ) : null,
  },
}

/**
 * Open a panel type in a specific dock from that dock's picker. Singleton
 * panels already present in either dock are ignored rather than moved.
 */
export function openPanelInDock(
  type: string,
  dockId: DockId,
  ctx: DockPanelContext
): void {
  const def = PANELS[type]
  if (!def) return
  const store = useDockStore.getState()
  const existing = Object.values(store.tabs).find((t) => t.type === type)
  if (existing) return
  store.openTab({
    type,
    singleton: def.singleton,
    defaultDock: def.defaultDock,
    dock: dockId,
    title: def.label,
  })
  // Opening the terminal must also ensure a PTY tab exists (mirrors the old
  // "opening the terminal creates a shell" behavior). Static store import is
  // safe: terminal/store depends on dock/store, not on this module, and the
  // heavy xterm code stays behind the lazy TerminalPanel import above.
  if (type === "terminal" && ctx.terminalWorkspaceId && ctx.terminalCwd) {
    useTerminalStore.getState().open(ctx.terminalWorkspaceId, ctx.terminalCwd)
  }
}
