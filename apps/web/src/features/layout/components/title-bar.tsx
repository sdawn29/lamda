import { useMemo, useRef, useState, useSyncExternalStore } from "react"
import {
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
  PanelBottom,
  PanelRight,
  MessageSquarePlus,
  Search,
  Clock,
  Container,
  Plus,
} from "lucide-react"
import {
  useRouter,
  useParams,
  useNavigate,
  useLocation,
  useSearch,
} from "@tanstack/react-router"
import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import { ButtonGroup } from "@/shared/ui/button-group"
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
import {
  BranchSelector,
  WorktreeSelector,
  useThreadBranchControls,
} from "@/features/git"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
} from "@/shared/ui/alert-dialog"
import { useSkillsSearchStore, useSkillDetails } from "@/features/skills"
import { useAutomationsUiStore } from "@/features/automations"
import { useDockStore, toggleReviewPanel } from "@/features/dock"
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
import { useCommandPalette } from "@/features/command-palette"
import { NotificationBell } from "@/features/notifications"
import { useIsMobile } from "@/shared/hooks/use-mobile"
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
              ? `Downloading ${Math.round(status.percent)}%`
              : "Downloading",
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
  const isAutomations = pathname === "/automations"
  const isSkills = pathname === "/skills"
  const isSkillDetail = pathname.startsWith("/skills/")
  const skillsQuery = useSkillsSearchStore((s) => s.query)
  const setSkillsQuery = useSkillsSearchStore((s) => s.setQuery)
  const openNewAutomation = useAutomationsUiStore((s) => s.openNew)
  const {
    workspaces,
    setThreadTitle,
    deleteThread,
    archiveThread,
    pinThread,
    unpinThread,
  } = useWorkspace()
  const { toggleSidebar, open: sidebarOpen } = useSidebar()
  // Mirrors the right sidebar's mobile breakpoint — once it collapses to a
  // sheet, surface the new-thread + search shortcuts here.
  const isMobile = useIsMobile(900)
  const openPalette = useCommandPalette((state) => state.openPalette)
  const bottomDockOpen = useDockStore((s) => s.docks.bottom.isOpen)
  const rightDockOpen = useDockStore((s) => s.docks.right.isOpen)
  const rightDockFullscreen = useDockStore((s) => s.rightDockFullscreen)
  const toggleRightDockFullscreen = useDockStore(
    (s) => s.toggleRightDockFullscreen
  )
  const toggleRightDock = useDockStore((s) => s.toggleDock)
  const closeRightDock = useDockStore((s) => s.closeDock)
  const handleToggleRightSidebar = () => {
    if (rightDockFullscreen) {
      toggleRightDockFullscreen()
      closeRightDock("right")
    } else {
      toggleRightDock("right")
    }
  }

  // URL-based thread — drives center display and thread actions
  const { threadId, id: skillDetailId } = useParams({ strict: false }) as {
    threadId?: string
    id?: string
  }
  const skillDetailSource = skillDetailId
    ? decodeURIComponent(skillDetailId)
    : undefined
  const { data: skillDetails } = useSkillDetails(
    isSkillDetail ? skillDetailSource : undefined
  )
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

  // On /new the URL has ?ws=<id>; use it to drive action buttons when no thread is active
  const { ws: newThreadWsId } = useSearch({ strict: false }) as { ws?: string }
  const actionWorkspace =
    urlActiveWorkspace ??
    (newThreadWsId ? workspaces.find((w) => w.id === newThreadWsId) : undefined)

  const effectiveWorkspacePath =
    urlActiveThread?.worktreePath ?? actionWorkspace?.path

  // Branch selector + "working location" (worktree) controls for the active
  // thread — rendered as an island beside the thread name below.
  const {
    branch,
    branches,
    gitError,
    clearGitError,
    handleGitError,
    handleBranchSelect,
  } = useThreadBranchControls({
    threadId: urlActiveThread?.id,
    sessionId: urlActiveThread?.sessionId ?? undefined,
    worktreeBranch: urlActiveThread?.worktreeBranch,
  })

  const { toggle: toggleTerminal, runCommand: runTerminalCommand } =
    useTerminalForWorkspace(
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

  const handleNewThread = () => {
    navigate({
      to: "/new",
      search: actionWorkspace ? { ws: actionWorkspace.id } : {},
    })
  }

  // Tracks how many BACK navigations we're currently "ahead" of, so
  // canGoForward can be derived without the router exposing it directly.
  // Held in a ref (mutated only from the history-subscription callback, an
  // event handler, not render) rather than a variable closed over by the
  // memo — a plain variable there would be a render-scoped value mutated
  // after render completes.
  const backForwardCountRef = useRef(0)
  const { subscribe, getSnapshot } = useMemo(() => {
    return {
      subscribe: (notify: () => void) =>
        router.history.subscribe(({ action }) => {
          if (action.type === "PUSH" || action.type === "REPLACE")
            backForwardCountRef.current = 0
          else if (action.type === "BACK") backForwardCountRef.current++
          else if (action.type === "FORWARD")
            backForwardCountRef.current = Math.max(
              0,
              backForwardCountRef.current - 1
            )
          notify()
        }),
      getSnapshot: () => backForwardCountRef.current > 0,
    }
  }, [router.history])

  const canGoBack = router.history.canGoBack()
  const canGoForward = useSyncExternalStore(subscribe, getSnapshot, () => false)

  useShortcutHandler(SHORTCUT_ACTIONS.TOGGLE_SIDEBAR, toggleSidebar)
  useShortcutHandler(
    SHORTCUT_ACTIONS.TOGGLE_REVIEW_PANEL,
    isSettings ? null : toggleReviewPanel
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
  const renameBinding = useShortcutBinding(SHORTCUT_ACTIONS.RENAME_THREAD)
  const sidebarBinding = useShortcutBinding(SHORTCUT_ACTIONS.TOGGLE_SIDEBAR)
  const backBinding = useShortcutBinding(SHORTCUT_ACTIONS.NAVIGATE_BACK)
  const forwardBinding = useShortcutBinding(SHORTCUT_ACTIONS.NAVIGATE_FORWARD)
  const rightSidebarBinding = useShortcutBinding(
    SHORTCUT_ACTIONS.TOGGLE_REVIEW_PANEL
  )
  const newThreadBinding = useShortcutBinding(SHORTCUT_ACTIONS.NEW_THREAD)
  const openPaletteBinding = useShortcutBinding(
    SHORTCUT_ACTIONS.OPEN_COMMAND_PALETTE
  )

  // Each control group is its own floating "island": a rounded, bordered pill
  // that opts out of the window drag region so its controls receive clicks in
  // Electron. The transparent strip between islands stays draggable so the
  // frameless window can still be moved by the title bar.
  const drag = { WebkitAppRegion: "drag" } as React.CSSProperties
  const noDrag = { WebkitAppRegion: "no-drag" } as React.CSSProperties
  const island =
    "flex h-full shrink-0 items-center rounded-xl border border-border bg-background px-0.5 shadow-sm [&_button]:rounded-lg"

  return (
    <>
      <AlertDialog
        open={gitError !== null}
        onOpenChange={(open) => {
          if (!open) clearGitError()
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Git Error</AlertDialogTitle>
            <AlertDialogDescription>{gitError}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={clearGitError}>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div
        className="fixed inset-x-2 top-2 z-50 flex h-8 items-center gap-2"
        style={drag}
      >
        {/* ── Traffic lights island (native macOS controls sit on top) ─────── */}
        {isMac && !isFullscreen && (
          <div className={cn(island, "w-[4.75rem]")} aria-hidden />
        )}

        {/* ── Left sidebar toggle ──────────────────────────────────────────── */}
        <div className={island} style={noDrag}>
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
        </div>

        {/* ── Navigation: back / forward ───────────────────────────────────── */}
        <div className={cn(island, "gap-0.5")} style={noDrag}>
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
              Go forward{" "}
              <ShortcutKbd binding={forwardBinding} className="ml-1" />
            </TooltipContent>
          </Tooltip>
        </div>

        {/* ── New thread + search (surfaced when left sidebar is hidden) ────── */}
        {(!sidebarOpen || isMobile) && (
          <div
            className={cn(
              island,
              "origin-left animate-in gap-0.5 duration-200 fade-in-0 zoom-in-90 slide-in-from-left-2"
            )}
            style={noDrag}
          >
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={handleNewThread}
                    className="size-7 text-muted-foreground/70 hover:text-foreground"
                  >
                    <MessageSquarePlus className="size-4" />
                    <span className="sr-only">New thread</span>
                  </Button>
                }
              />
              <TooltipContent>
                New thread{" "}
                <ShortcutKbd binding={newThreadBinding} className="ml-1" />
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={openPalette}
                    className="size-7 text-muted-foreground/70 hover:text-foreground"
                  >
                    <Search className="size-4" />
                    <span className="sr-only">Search</span>
                  </Button>
                }
              />
              <TooltipContent>
                Search{" "}
                <ShortcutKbd binding={openPaletteBinding} className="ml-1" />
              </TooltipContent>
            </Tooltip>
          </div>
        )}

        {/* ── Automations page island: heading + new-automation action ──────── */}
        {isAutomations && (
          <div className={cn(island, "shrink-0 gap-1.5 px-2.5")} style={noDrag}>
            <Clock className="size-3.5 text-muted-foreground/70" />
            <span className="text-sm font-semibold text-foreground">
              Automations
            </span>
            <Button
              size="sm"
              className="ml-1 h-6 gap-1 px-2 text-xs"
              onClick={openNewAutomation}
              disabled={workspaces.length === 0}
            >
              <Plus className="size-3.5" />
              New
            </Button>
          </div>
        )}

        {/* ── Skills page islands: heading + registry search ────────────────── */}
        {isSkills && (
          <>
            <div
              className={cn(island, "shrink-0 gap-1.5 px-2.5")}
              style={noDrag}
            >
              <Container className="size-3.5 text-muted-foreground/70" />
              <span className="text-sm font-semibold text-foreground">
                Skills
              </span>
            </div>
            <div
              className={cn(island, "w-64 shrink-0 gap-1.5 px-2.5")}
              style={noDrag}
            >
              <Search className="size-3.5 shrink-0 text-muted-foreground/60" />
              <input
                value={skillsQuery}
                onChange={(e) => setSkillsQuery(e.target.value)}
                placeholder="Search skills.sh"
                style={noDrag}
                className="w-full min-w-0 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50"
              />
            </div>
          </>
        )}

        {/* ── Skill detail page island: breadcrumb (back nav lives in the
          navigation island) ────────────────────────────────────────────── */}
        {isSkillDetail && (
          <div
            className={cn(island, "min-w-0 shrink gap-1.5 px-2.5")}
            style={noDrag}
          >
            <Container className="size-3.5 shrink-0 text-muted-foreground/70" />
            <span className="shrink-0 text-sm font-semibold text-muted-foreground/70">
              Skills
            </span>
            {skillDetails && (
              <>
                <span className="text-muted-foreground/40 select-none">/</span>
                <span className="min-w-0 truncate text-sm font-semibold text-foreground">
                  {skillDetails.name}
                </span>
              </>
            )}
          </div>
        )}

        {/* ── Thread name + options island (truncates, shrinks before filler) ─
            Hidden on mobile — it floats over the chat view instead, alongside
            the branch and working-location controls. ───────────────────── */}
        {urlActiveThread && !isMobile && (
          <div
            className={cn(
              island,
              "group/thread-title min-w-0 shrink gap-1 overflow-hidden px-1.5"
            )}
            style={noDrag}
          >
            {urlActiveWorkspace && (
              <Badge
                variant="secondary"
                className="hidden shrink truncate sm:inline-flex"
              >
                {urlActiveWorkspace.name}
              </Badge>
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
                          className="ml-0 max-w-0 shrink-0 translate-x-1 overflow-hidden text-muted-foreground/50 opacity-0 transition-all duration-150 group-hover/thread-title:ml-0.5 group-hover/thread-title:max-w-5 group-hover/thread-title:translate-x-0 group-hover/thread-title:opacity-100 focus-visible:ml-0.5 focus-visible:max-w-5 focus-visible:translate-x-0 focus-visible:opacity-100 aria-expanded:ml-0.5 aria-expanded:max-w-5 aria-expanded:translate-x-0 aria-expanded:opacity-100"
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
                    variant="destructive"
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

        {/* ── Branch selector island ─────────────────────────────────────────── */}
        {urlActiveThread && !isMobile && (
          <div className={cn(island, "shrink-0")} style={noDrag}>
            <BranchSelector
              branch={branch}
              branches={branches}
              onBranchSelect={handleBranchSelect}
              onGitError={handleGitError}
              sessionId={urlActiveThread.sessionId ?? undefined}
              disabled={!!urlActiveThread.worktreeBranch}
              disabledReason="This thread runs in a worktree — its branch is managed by the worktree selector"
            />
          </div>
        )}

        {/* ── Working location (worktree) island ─────────────────────────────── */}
        {urlActiveThread &&
          !isMobile &&
          (branch !== null || branches.length > 0) && (
            <div className={cn(island, "shrink-0")} style={noDrag}>
              <WorktreeSelector
                threadId={urlActiveThread.id}
                sessionId={urlActiveThread.sessionId ?? undefined}
                threadTitle={urlActiveThread.title}
                branches={branches}
                currentBranch={branch}
                worktreeBranch={urlActiveThread.worktreeBranch}
                onError={handleGitError}
              />
            </div>
          )}

        {/* Flexible filler — draggable gap separating left and right islands. */}
        <div className="h-full min-w-4 flex-1" />

        {/* ── Notifications (always visible, not workspace-scoped) ──────────── */}
        <div className={island} style={noDrag}>
          <NotificationBell />
        </div>

        {/* ── Update notice (only when an update is pending) ───────────────── */}
        {updateStatus &&
          updateStatus.phase !== "idle" &&
          updateStatus.phase !== "checking" && (
            <div className={island} style={noDrag}>
              <UpdateButton status={updateStatus} />
            </div>
          )}

        {/* Task, open-with, and dock-control islands are workspace/
          thread-scoped, so they're hidden on the (global) automations and
          skills pages. */}
        {!isAutomations && !isSkills && !isSkillDetail && (
          <>
            {/* ── Task dropdown ──────────────────────────────────────────────── */}
            <div className={island} style={noDrag}>
              <TasksDropdown
                workspaceId={actionWorkspace?.id ?? ""}
                onRunTask={runTerminalCommand}
                isMobile={isMobile}
              />
            </div>

            {/* ── Open in workspace ──────────────────────────────────────────── */}
            <div className={island} style={noDrag}>
              <OpenWithButton
                workspaceId={actionWorkspace?.id}
                workspacePath={actionWorkspace?.path}
                openWithAppId={actionWorkspace?.openWithAppId}
                isMobile={isMobile}
              />
            </div>

            {/* ── Sidebar controls ────────────────────────────────────────────── */}
            <ButtonGroup
              className={island}
              style={noDrag}
              aria-label="Sidebar controls"
            >
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => toggleRightDock("bottom")}
                      aria-pressed={bottomDockOpen}
                      className="size-7 text-muted-foreground hover:text-foreground aria-pressed:bg-accent aria-pressed:text-accent-foreground"
                    >
                      <PanelBottom data-icon="inline-start" />
                      <span className="sr-only">Toggle bottom sidebar</span>
                    </Button>
                  }
                />
                <TooltipContent>Toggle bottom sidebar</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={handleToggleRightSidebar}
                      aria-pressed={rightDockOpen || rightDockFullscreen}
                      className="size-7 text-muted-foreground hover:text-foreground aria-pressed:bg-accent aria-pressed:text-accent-foreground"
                    >
                      <PanelRight data-icon="inline-start" />
                      <span className="sr-only">Toggle right sidebar</span>
                    </Button>
                  }
                />
                <TooltipContent>
                  Toggle right sidebar{" "}
                  <ShortcutKbd binding={rightSidebarBinding} className="ml-1" />
                </TooltipContent>
              </Tooltip>
            </ButtonGroup>
          </>
        )}
      </div>
    </>
  )
}
