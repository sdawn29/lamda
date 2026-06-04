import { useMemo, useRef, useState, useSyncExternalStore } from "react"
import {
  TerminalSquare,
  MoreHorizontal,
  Pencil,
  Trash2,
  Download,
  RefreshCw,
  Pin,
  PinOff,
  Archive,
  Copy,
} from "lucide-react"
import {
  useRouter,
  useParams,
  useNavigate,
  useLocation,
  useSearch,
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
import {
  useElectronFullscreen,
  useElectronPlatform,
  useElectronUpdateStatus,
  useDownloadUpdate,
  useInstallUpdate,
  useAutoUpdateCheck,
  type ElectronUpdateStatus,
} from "@/features/electron"
import { OpenWithButton } from "./open-with-button"
import {
  useShortcutHandler,
  useShortcutBinding,
} from "@/shared/components/keyboard-shortcuts-provider"
import { SHORTCUT_ACTIONS } from "@/shared/lib/keyboard-shortcuts"
import { ShortcutKbd } from "@/shared/ui/kbd"
import { TasksDropdown } from "@/features/tasks"
import { useMainTabs } from "@/features/main-tabs"
import { cn } from "@/shared/lib/utils"

function UpdateButton({ status }: { status: ElectronUpdateStatus }) {
  const downloadUpdate = useDownloadUpdate()
  const installUpdate = useInstallUpdate()
  const navigate = useNavigate()

  if (status.phase === "available") {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="sm"
              className="h-7 gap-1.5 px-2.5 text-xs"
              onClick={() => downloadUpdate.mutate()}
              disabled={downloadUpdate.isPending}
            >
              <Download className="size-3.5 shrink-0" />
              {status.version ? `v${status.version} available` : "Update available"}
            </Button>
          }
        />
        <TooltipContent>Download and install the latest version</TooltipContent>
      </Tooltip>
    )
  }

  if (status.phase === "downloading") {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="sm"
              className="h-7 gap-1.5 px-2.5 text-xs"
              disabled
            >
              <Download className="size-3.5 shrink-0 animate-bounce" />
              {status.percent != null
                ? `Downloading… ${Math.round(status.percent)}%`
                : "Downloading…"}
            </Button>
          }
        />
        <TooltipContent>Downloading update</TooltipContent>
      </Tooltip>
    )
  }

  if (status.phase === "ready") {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="sm"
              className="h-7 gap-1.5 px-2.5 text-xs"
              onClick={() => installUpdate.mutate()}
            >
              <RefreshCw className="size-3.5 shrink-0" />
              Restart to install
            </Button>
          }
        />
        <TooltipContent>Restart the app to apply the update</TooltipContent>
      </Tooltip>
    )
  }

  if (status.phase === "error") {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 px-2.5 text-xs text-destructive border-destructive/40 hover:bg-destructive/10"
              onClick={() =>
                navigate({
                  to: "/settings/$section",
                  params: { section: "updates" },
                })
              }
            >
              Update error
            </Button>
          }
        />
        <TooltipContent>{status.message ?? "Update failed — click for details"}</TooltipContent>
      </Tooltip>
    )
  }

  return null
}

export function TitleBar() {
  const router = useRouter()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const isSettings = pathname === "/settings"
  const {
    workspaces,
    setThreadTitle,
    deleteThread,
    archiveThread,
    pinThread,
    unpinThread,
  } = useWorkspace()
  const { toggleSidebar, state: sidebarState } = useSidebar()
  const { isOpen: rightSidebarOpen, togglePanel } = useRightSidebar()
  const toggleDiff = () => togglePanel("changes")
  const { activeTab } = useMainTabs()

  // URL-based thread — drives center display and thread actions
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

  // File tab from the right-sidebar store — shown in title bar when a file is open
  const activeTabFile = activeTab?.type === "file" ? activeTab : null

  const fileWorkspace = useMemo(() => {
    if (!activeTabFile) return null
    return (
      workspaces.find((ws) => ws.path === activeTabFile.workspacePath) ?? null
    )
  }, [activeTabFile, workspaces])

  // On /new the URL has ?ws=<id>; use it to drive action buttons when no thread is active
  const { ws: newThreadWsId } = useSearch({ strict: false }) as { ws?: string }
  const actionWorkspace =
    urlActiveWorkspace ??
    (newThreadWsId ? workspaces.find((w) => w.id === newThreadWsId) : undefined)

  const effectiveWorkspacePath =
    actionWorkspace?.path ?? fileWorkspace?.path

  const {
    isOpen: terminalOpen,
    toggle: toggleTerminal,
    runCommand: runTerminalCommand,
  } = useTerminalForWorkspace(
    actionWorkspace?.id ?? "",
    actionWorkspace?.path ?? ""
  )
  const { data: platform } = useElectronPlatform()
  const { data: isFullscreen = false } = useElectronFullscreen()
  const isMac = platform === "darwin"

  // Auto update check — fires once per week in Electron, no-op in browser.
  useAutoUpdateCheck()
  const { data: updateStatus } = useElectronUpdateStatus()

  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState("")
  const renameInputRef = useRef<HTMLInputElement>(null)

  const startRename = () => {
    setRenameValue(urlActiveThread?.title ?? "")
    setIsRenaming(true)
    setTimeout(() => renameInputRef.current?.select(), 0)
  }

  const commitRename = () => {
    if (urlActiveWorkspace && urlActiveThread && renameValue.trim()) {
      setThreadTitle(
        urlActiveWorkspace.id,
        urlActiveThread.id,
        renameValue.trim()
      )
    }
    setIsRenaming(false)
  }

  const handleDeleteThread = async () => {
    if (!urlActiveWorkspace || !urlActiveThread) return
    await deleteThread(urlActiveWorkspace.id, urlActiveThread.id)
    navigate({ to: "/" })
  }

  const handleTogglePin = async () => {
    if (!urlActiveWorkspace || !urlActiveThread) return
    if (urlActiveThread.isPinned) {
      await unpinThread(urlActiveWorkspace.id, urlActiveThread.id)
    } else {
      await pinThread(urlActiveWorkspace.id, urlActiveThread.id)
    }
  }

  const handleArchiveThread = async () => {
    if (!urlActiveWorkspace || !urlActiveThread) return
    await archiveThread(urlActiveWorkspace.id, urlActiveThread.id)
    navigate({ to: "/" })
  }

  const handleCopyThreadId = () => {
    if (!urlActiveThread) return
    void navigator.clipboard.writeText(urlActiveThread.id)
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
    SHORTCUT_ACTIONS.TOGGLE_REVIEW_PANEL,
    isSettings ? null : toggleDiff
  )
  useShortcutHandler(
    SHORTCUT_ACTIONS.TOGGLE_TERMINAL,
    isSettings ? null : toggleTerminal
  )
  useShortcutHandler(
    SHORTCUT_ACTIONS.RENAME_THREAD,
    urlActiveThread ? startRename : null
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

  // Only the breadcrumb's empty space opts into dragging; the root and the
  // edge control clusters stay non-draggable so the floating sidebar toggles
  // (which overlay the title bar) reliably receive their clicks in Electron.
  const drag = { WebkitAppRegion: "drag" } as React.CSSProperties
  const noDrag = { WebkitAppRegion: "no-drag" } as React.CSSProperties

  return (
    <div className="sticky top-0 z-20 flex h-11 shrink-0 items-center bg-background pl-2">
      {/* Breadcrumb — search + separator + context / primary */}
      <div className="flex min-w-0 flex-1 items-center gap-0 px-1">
        {/* Reserves space for the floating left controls (sidebar toggle, back/forward).
            Stays out of the drag region so their clicks aren't swallowed. */}
        <div
          aria-hidden
          className={cn(
            "h-full shrink-0 transition-[width] duration-200 ease-linear",
            sidebarState === "collapsed"
              ? isMac && !isFullscreen
                ? "w-48"
                : "w-28"
              : "w-0"
          )}
        />
        {/* Draggable area — begins after the reserved left strip, so no drag
            region ever sits under the floating controls. */}
        <div
          className="flex min-w-0 flex-1 items-center gap-1"
          style={drag}
        >
          {urlActiveThread && (
            <>
              {urlActiveWorkspace && (
                <>
                <span className="shrink truncate text-[11px] font-medium text-muted-foreground/70">
                  {urlActiveWorkspace.name}
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
                  style={noDrag}
                  className="col-start-1 row-start-1 w-full min-w-0 bg-transparent text-sm font-semibold outline-none"
                />
              </span>
            ) : (
              <span className="min-w-0 truncate text-sm font-semibold text-foreground">
                {urlActiveThread.title}
              </span>
            )}
            <Tooltip>
              <DropdownMenu>
                <TooltipTrigger
                  render={
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          style={noDrag}
                          className="ml-0.5 shrink-0 text-muted-foreground/50"
                        />
                      }
                    >
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
                  <DropdownMenuItem onClick={handleTogglePin}>
                    {urlActiveThread.isPinned ? (
                      <>
                        <PinOff className="mr-2 h-4 w-4" />
                        Unpin
                      </>
                    ) : (
                      <>
                        <Pin className="mr-2 h-4 w-4" />
                        Pin
                      </>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleCopyThreadId}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy Thread ID
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleArchiveThread}>
                    <Archive className="mr-2 h-4 w-4" />
                    Archive
                  </DropdownMenuItem>
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
            </>
          )}
        </div>
      </div>

      {/* Right — session actions */}
      <div
        className={cn(
          "flex shrink-0 items-center gap-0.5 px-2 transition-[padding-right] duration-200 ease-linear",
          !rightSidebarOpen && "pr-9"
        )}
        style={noDrag}
      >
        {updateStatus && updateStatus.phase !== "idle" && updateStatus.phase !== "checking" && (
          <UpdateButton status={updateStatus} />
        )}

        <TasksDropdown
          workspaceId={actionWorkspace?.id ?? ""}
          onRunTask={runTerminalCommand}
        />

        <OpenWithButton
          workspaceId={actionWorkspace?.id}
          workspacePath={actionWorkspace?.path}
          openWithAppId={actionWorkspace?.openWithAppId}
        />

        <Tooltip>
          <TooltipTrigger
            render={
              <Toggle
                pressed={terminalOpen}
                onPressedChange={() => toggleTerminal()}
                disabled={!effectiveWorkspacePath}
                className="size-7 text-muted-foreground hover:bg-muted/60 hover:text-foreground disabled:opacity-30 aria-pressed:bg-muted aria-pressed:text-foreground"
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

    </div>
  )
}
