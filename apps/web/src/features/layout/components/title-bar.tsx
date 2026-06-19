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
  ChevronLeft,
  ChevronRight,
  PanelRight,
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
import { useSidebar, SidebarTrigger } from "@/shared/ui/sidebar"
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
  useAutoUpdateCheck,
  UpdateDialog,
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
  const navigate = useNavigate()
  const [dialogOpen, setDialogOpen] = useState(false)

  if (status.phase === "error") {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 border-destructive/40 px-2.5 text-xs text-destructive hover:bg-destructive/10"
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
        <TooltipContent>
          {status.message ?? "Update failed — click for details"}
        </TooltipContent>
      </Tooltip>
    )
  }

  const { label, icon, tooltip } = (() => {
    switch (status.phase) {
      case "available":
        return {
          label: status.version
            ? `v${status.version} available`
            : "Update available",
          icon: <Download className="size-3.5 shrink-0" />,
          tooltip: "View what's new and download the update",
        }
      case "downloading":
        return {
          label:
            status.percent != null
              ? `Downloading… ${Math.round(status.percent)}%`
              : "Downloading…",
          icon: <Download className="size-3.5 shrink-0 animate-bounce" />,
          tooltip: "Downloading update",
        }
      case "ready":
        return {
          label: "Restart to install",
          icon: <RefreshCw className="size-3.5 shrink-0" />,
          tooltip: "View what's new and restart to install",
        }
      default:
        return null
    }
  })() ?? { label: null, icon: null, tooltip: null }

  if (!label) return null

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="sm"
              className="h-7 gap-1.5 px-2.5 text-xs"
              onClick={() => setDialogOpen(true)}
            >
              {icon}
              {label}
            </Button>
          }
        />
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
      <UpdateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        status={status}
      />
    </>
  )
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
  const { toggleSidebar } = useSidebar()
  const {
    isOpen: rightSidebarOpen,
    togglePanel,
    toggle: toggleRightSidebar,
  } = useRightSidebar()
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
    urlActiveThread?.worktreePath ??
    actionWorkspace?.path ??
    fileWorkspace?.path

  const {
    isOpen: terminalOpen,
    toggle: toggleTerminal,
    runCommand: runTerminalCommand,
  } = useTerminalForWorkspace(
    actionWorkspace?.id ?? "",
    effectiveWorkspacePath ?? ""
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
  const sidebarBinding = useShortcutBinding(SHORTCUT_ACTIONS.TOGGLE_SIDEBAR)
  const backBinding = useShortcutBinding(SHORTCUT_ACTIONS.NAVIGATE_BACK)
  const forwardBinding = useShortcutBinding(SHORTCUT_ACTIONS.NAVIGATE_FORWARD)
  const rightSidebarBinding = useShortcutBinding(
    SHORTCUT_ACTIONS.TOGGLE_REVIEW_PANEL
  )

  // The whole bar is a no-drag island so every control receives its clicks in
  // Electron; only the flexible filler in the middle opts back into the window
  // drag region so the frameless window can still be moved by the title strip.
  const drag = { WebkitAppRegion: "drag" } as React.CSSProperties
  const noDrag = { WebkitAppRegion: "no-drag" } as React.CSSProperties

  return (
    <div
      className="fixed inset-x-2 top-2 z-50 flex h-9 items-center gap-1 overflow-hidden rounded-2xl border border-border bg-background pr-1.5 shadow-md"
      style={drag}
    >
      {/* ── Left: window / navigation controls ──────────────────────────── */}
      <div
        className={cn(
          "flex h-full shrink-0 items-center gap-0.5",
          isMac && !isFullscreen ? "pl-[4.75rem]" : "pl-1.5"
        )}
        style={noDrag}
      >
        <Tooltip>
          <TooltipTrigger
            render={
              <SidebarTrigger className="size-7 text-muted-foreground/70 hover:text-foreground" />
            }
          />
          <TooltipContent>
            Toggle sidebar{" "}
            <ShortcutKbd binding={sidebarBinding} className="ml-1" />
          </TooltipContent>
        </Tooltip>
        <div className="mx-0.5 h-3.5 w-px shrink-0 bg-border" />
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => router.history.back()}
                disabled={!canGoBack}
                className="size-7 text-muted-foreground/60 hover:text-foreground disabled:opacity-25"
              >
                <ChevronLeft className="size-4" />
                <span className="sr-only">Go back</span>
              </Button>
            }
          />
          <TooltipContent>
            Go back <ShortcutKbd binding={backBinding} className="ml-1" />
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => router.history.forward()}
                disabled={!canGoForward}
                className="size-7 text-muted-foreground/60 hover:text-foreground disabled:opacity-25"
              >
                <ChevronRight className="size-4" />
                <span className="sr-only">Go forward</span>
              </Button>
            }
          />
          <TooltipContent>
            Go forward <ShortcutKbd binding={forwardBinding} className="ml-1" />
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="mx-0.5 h-4 w-px shrink-0 bg-border" />

      {/* ── Middle: thread breadcrumb · right-panel tabs · drag filler ───── */}
      <div className="flex min-w-0 flex-1 items-center gap-1">
        {urlActiveThread && (
          <div className="flex min-w-0 shrink items-center gap-1 pl-0.5">
            {urlActiveWorkspace && (
              <>
                <span className="hidden shrink truncate text-2xs font-medium text-muted-foreground/70 sm:inline">
                  {urlActiveWorkspace.name}
                </span>
                <span className="mx-0.5 hidden shrink-0 text-2xs text-muted-foreground/40 select-none sm:inline">
                  /
                </span>
              </>
            )}
            {isRenaming ? (
              <span className="inline-grid min-w-0">
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
          </div>
        )}

        {/* Flexible filler — extra drag surface in the middle of the bar. */}
        <div className="h-full min-w-4 flex-1" />
      </div>

      {/* ── Right: session actions + panel toggles ───────────────────────── */}
      <div className="flex shrink-0 items-center gap-0.5" style={noDrag}>
        {updateStatus &&
          updateStatus.phase !== "idle" &&
          updateStatus.phase !== "checking" && (
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

        <div className="mx-0.5 h-4 w-px shrink-0 bg-border" />

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={toggleRightSidebar}
                aria-pressed={rightSidebarOpen}
                className="size-7 text-muted-foreground hover:text-foreground aria-pressed:bg-accent aria-pressed:text-accent-foreground"
              >
                <PanelRight className="size-4" />
                <span className="sr-only">Toggle right sidebar</span>
              </Button>
            }
          />
          <TooltipContent>
            Toggle right sidebar{" "}
            <ShortcutKbd binding={rightSidebarBinding} className="ml-1" />
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}
