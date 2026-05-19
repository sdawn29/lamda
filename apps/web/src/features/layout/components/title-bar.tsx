import { useMemo, useRef, useState, useSyncExternalStore } from "react"
import {
  TerminalSquare,
  MoreHorizontal,
  Pencil,
  Trash2,
  Server,
  Play,
} from "lucide-react"
import { Icon } from "@iconify/react"
import {
  useRouter,
  useParams,
  useNavigate,
  useLocation,
} from "@tanstack/react-router"
import { Button } from "@/shared/ui/button"
import { Toggle } from "@/shared/ui/toggle"
import { useSidebar } from "@/shared/ui/sidebar"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/shared/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu"
import { useWorkspace } from "@/features/workspace"
import { useTerminalForWorkspace } from "@/features/terminal"
import { useRightSidebar } from "../store/right-sidebar"
import { useElectronFullscreen, useElectronPlatform } from "@/features/electron"
import { OpenWithButton } from "./open-with-button"
import {
  useShortcutHandler,
  useShortcutBinding,
} from "@/shared/components/keyboard-shortcuts-provider"
import { SHORTCUT_ACTIONS } from "@/shared/lib/keyboard-shortcuts"
import { ShortcutKbd } from "@/shared/ui/kbd"
import { McpDialog, useMcpServerStatus } from "@/features/mcp"
import { TasksDialog } from "@/features/tasks"
import { useMainTabs } from "@/features/main-tabs"
import { getIconName } from "@/shared/ui/file-icon"
import { cn } from "@/shared/lib/utils"

export function TitleBar() {
  const router = useRouter()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const isSettings = pathname === "/settings"
  const { workspaces, setThreadTitle, deleteThread } = useWorkspace()
  const { toggleSidebar, state: sidebarState } = useSidebar()
  const { isOpen: rightSidebarOpen, togglePanel } = useRightSidebar()
  const toggleDiff = () => togglePanel("changes")
  const { activeTab } = useMainTabs()

  // URL-based thread/workspace — used for right-side session controls
  // (git, terminal, MCP stay tied to the navigated thread even when a file tab is shown)
  const { threadId } = useParams({ strict: false }) as { threadId?: string }
  const urlActiveThread = useMemo(
    () =>
      threadId
        ? workspaces.flatMap((w) => w.threads).find((t) => t.id === threadId)
        : undefined,
    [workspaces, threadId]
  )
  const urlActiveWorkspace = useMemo(
    () =>
      urlActiveThread
        ? workspaces.find((w) =>
            w.threads.some((t) => t.id === urlActiveThread.id)
          )
        : undefined,
    [workspaces, urlActiveThread]
  )

  // Active-tab-based context — used for center display and thread actions
  const activeTabThread = useMemo(() => {
    if (activeTab?.type !== "thread") return null
    return (
      workspaces
        .flatMap((w) => w.threads)
        .find((t) => t.id === activeTab.threadId) ?? null
    )
  }, [activeTab, workspaces])

  const activeTabWorkspace = useMemo(() => {
    if (!activeTabThread) return null
    return (
      workspaces.find((w) =>
        w.threads.some((t) => t.id === activeTabThread.id)
      ) ?? null
    )
  }, [activeTabThread, workspaces])

  const activeTabFile = activeTab?.type === "file" ? activeTab : null

  const fileWorkspace = useMemo(() => {
    if (!activeTabFile) return null
    return (
      workspaces.find((ws) => ws.path === activeTabFile.workspacePath) ?? null
    )
  }, [activeTabFile, workspaces])

  const effectiveWorkspacePath = urlActiveWorkspace?.path ?? fileWorkspace?.path

  const fileRelativePath = !activeTabFile
    ? ""
    : !activeTabFile.workspacePath ||
        !activeTabFile.filePath.startsWith(activeTabFile.workspacePath)
      ? activeTabFile.filePath
      : activeTabFile.filePath
          .slice(activeTabFile.workspacePath.length)
          .replace(/^[/\\]+/, "")

  const {
    isOpen: terminalOpen,
    toggle: toggleTerminal,
    runCommand: runTerminalCommand,
  } = useTerminalForWorkspace(
    urlActiveWorkspace?.id ?? "",
    urlActiveWorkspace?.path ?? ""
  )
  const { data: platform } = useElectronPlatform()
  const { data: isFullscreen = false } = useElectronFullscreen()
  const isMac = platform === "darwin"

  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState("")
  const renameInputRef = useRef<HTMLInputElement>(null)
  const [mcpDialogOpen, setMcpDialogOpen] = useState(false)
  const [tasksDialogOpen, setTasksDialogOpen] = useState(false)
  const { data: mcpServerStatus } = useMcpServerStatus(
    urlActiveWorkspace?.id ?? ""
  )
  const mcpConnectedCount =
    mcpServerStatus?.filter((s) => s.connected).length ?? 0

  const startRename = () => {
    setRenameValue(activeTabThread?.title ?? "")
    setIsRenaming(true)
    setTimeout(() => renameInputRef.current?.select(), 0)
  }

  const commitRename = () => {
    if (activeTabWorkspace && activeTabThread && renameValue.trim()) {
      setThreadTitle(
        activeTabWorkspace.id,
        activeTabThread.id,
        renameValue.trim()
      )
    }
    setIsRenaming(false)
  }

  const handleDeleteThread = async () => {
    if (!activeTabWorkspace || !activeTabThread) return
    await deleteThread(activeTabWorkspace.id, activeTabThread.id)
    navigate({ to: "/" })
  }

  const { subscribe, getSnapshot } = useMemo(() => {
    let count = 0
    return {
      subscribe: (notify: () => void) =>
        router.history.subscribe(({ action }) => {
          if (action.type === "PUSH" || action.type === "REPLACE") count = 0
          else if (action.type === "BACK") count++
          else if (action.type === "FORWARD") count = Math.max(0, count - 1)
          notify()
        }),
      getSnapshot: () => count > 0,
    }
  }, [router.history])

  const canGoBack = router.history.canGoBack()
  const canGoForward = useSyncExternalStore(subscribe, getSnapshot, () => false)

  useShortcutHandler(SHORTCUT_ACTIONS.TOGGLE_SIDEBAR, toggleSidebar)
  useShortcutHandler(
    SHORTCUT_ACTIONS.TOGGLE_DIFF_PANEL,
    isSettings ? null : toggleDiff
  )
  useShortcutHandler(
    SHORTCUT_ACTIONS.TOGGLE_TERMINAL,
    isSettings ? null : toggleTerminal
  )
  useShortcutHandler(
    SHORTCUT_ACTIONS.RENAME_THREAD,
    activeTabThread ? startRename : null
  )
  useShortcutHandler(
    SHORTCUT_ACTIONS.NAVIGATE_BACK,
    canGoBack ? () => router.history.back() : null
  )
  useShortcutHandler(
    SHORTCUT_ACTIONS.NAVIGATE_FORWARD,
    canGoForward ? () => router.history.forward() : null
  )
  const terminalBinding = useShortcutBinding(SHORTCUT_ACTIONS.TOGGLE_TERMINAL)
  const renameBinding = useShortcutBinding(SHORTCUT_ACTIONS.RENAME_THREAD)

  return (
    <div
      className="sticky top-0 z-20 flex h-11 shrink-0 items-center bg-background pl-2"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      {/* Breadcrumb — search + separator + context / primary */}
      <div
        className={cn(
          "flex min-w-0 flex-1 items-center gap-0 px-1 transition-[padding-left] duration-200 ease-linear",
          sidebarState === "collapsed" &&
            (isMac && !isFullscreen ? "pl-48" : "pl-28")
        )}
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        {activeTab?.type === "thread" && activeTabThread ? (
          <div className="flex min-w-0 flex-1 items-center gap-1">
            {activeTabWorkspace && (
              <>
                <span className="shrink truncate text-[11px] font-medium text-muted-foreground/70">
                  {activeTabWorkspace.name}
                </span>
                <span className="mx-0.5 shrink-0 text-[11px] text-muted-foreground/40 select-none">
                  /
                </span>
              </>
            )}
            {isRenaming ? (
              <span className="inline-grid min-w-0 flex-1">
                <span
                  aria-hidden
                  className="invisible col-start-1 row-start-1 text-sm font-semibold whitespace-pre"
                >
                  {renameValue || " "}
                </span>
                <input
                  ref={renameInputRef}
                  autoFocus
                  size={1}
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename()
                    if (e.key === "Escape") setIsRenaming(false)
                  }}
                  className="col-start-1 row-start-1 w-full min-w-0 bg-transparent text-sm font-semibold outline-none"
                />
              </span>
            ) : (
              <span className="min-w-0 truncate text-sm font-semibold text-foreground">
                {activeTabThread.title}
              </span>
            )}
            <Tooltip>
              <DropdownMenu>
                <TooltipTrigger
                  render={
                    <DropdownMenuTrigger className="ml-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:bg-accent hover:text-foreground focus:ring-0 focus-visible:outline-none">
                      <MoreHorizontal className="size-3.5" />
                      <span className="sr-only">Thread options</span>
                    </DropdownMenuTrigger>
                  }
                />
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={startRename}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Rename
                    <ShortcutKbd
                      binding={renameBinding}
                      className="ml-auto pl-2"
                    />
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={handleDeleteThread}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Thread
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <TooltipContent>Thread options</TooltipContent>
            </Tooltip>
          </div>
        ) : activeTab?.type === "file" && activeTabFile ? (
          <div className="flex min-w-0 flex-1 items-center gap-1">
            {fileWorkspace && (
              <>
                <span className="shrink truncate text-[11px] font-medium text-muted-foreground/70">
                  {fileWorkspace.name}
                </span>
                <span className="mx-0.5 shrink-0 text-[11px] text-muted-foreground/40 select-none">
                  /
                </span>
              </>
            )}
            <Icon
              icon={`catppuccin:${getIconName(activeTabFile.title)}`}
              className="size-3.5 shrink-0 opacity-70"
              aria-hidden
            />
            <span
              className="min-w-0 truncate text-sm font-semibold text-foreground"
              title={fileRelativePath}
            >
              {activeTabFile.title}
            </span>
          </div>
        ) : null}
      </div>

      {/* Right — session actions */}
      <div
        className={cn(
          "flex shrink-0 items-center gap-1.5 px-2 transition-[padding-right] duration-200 ease-linear",
          !rightSidebarOpen && "pr-9"
        )}
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="outline"
                size="icon"
                onClick={() => setTasksDialogOpen(true)}
                className="h-7 w-auto gap-1.5 px-2"
              >
                <Play className="size-3.5 shrink-0" />
                <span className="sr-only">Tasks</span>
              </Button>
            }
          />
          <TooltipContent>Tasks</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="outline"
                size="icon"
                onClick={() => setMcpDialogOpen(true)}
                className="h-7 w-auto gap-1.5 px-2"
              >
                <Server className="size-3.5 shrink-0" />
                {mcpConnectedCount > 0 && (
                  <span className="flex items-center gap-1 text-[11px] font-medium tabular-nums">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" />
                    {mcpConnectedCount}
                  </span>
                )}
                <span className="sr-only">MCP servers</span>
              </Button>
            }
          />
          <TooltipContent>MCP servers</TooltipContent>
        </Tooltip>

        <OpenWithButton
          workspaceId={urlActiveWorkspace?.id}
          workspacePath={urlActiveWorkspace?.path}
          openWithAppId={urlActiveWorkspace?.openWithAppId}
        />

        <Tooltip>
          <TooltipTrigger
            render={
              <Toggle
                pressed={terminalOpen}
                onPressedChange={() => toggleTerminal()}
                disabled={!effectiveWorkspacePath}
                className="size-7 text-muted-foreground hover:bg-muted/60 hover:text-foreground disabled:opacity-30 aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-sm"
              >
                <TerminalSquare className="size-4" />
                <span className="sr-only">Toggle terminal</span>
              </Toggle>
            }
          />
          <TooltipContent>
            Toggle terminal{" "}
            <ShortcutKbd binding={terminalBinding} className="ml-1" />
          </TooltipContent>
        </Tooltip>

      </div>

      <McpDialog
        open={mcpDialogOpen}
        onOpenChange={setMcpDialogOpen}
        workspaceId={urlActiveWorkspace?.id}
      />

      <TasksDialog
        open={tasksDialogOpen}
        onOpenChange={setTasksDialogOpen}
        workspaceId={urlActiveWorkspace?.id}
        onRunTask={runTerminalCommand}
      />
    </div>
  )
}
