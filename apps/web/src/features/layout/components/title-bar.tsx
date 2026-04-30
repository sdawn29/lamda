import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import {
  ChevronLeft,
  ChevronRight,
  TerminalSquare,
  MoreHorizontal,
  Pencil,
  Trash2,
  FileDiff,
  FolderTree,
} from "lucide-react"
import {
  useRouter,
  useParams,
  useNavigate,
  useLocation,
} from "@tanstack/react-router"
import { Button } from "@/shared/ui/button"
import { SidebarTrigger, useSidebar } from "@/shared/ui/sidebar"
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
import { useDiffPanel } from "@/features/git"
import { useFileTree } from "@/features/file-tree"
import { useElectronFullscreen, useElectronPlatform } from "@/features/electron"
import { CommitDialog } from "@/features/git"
import { useGitDiffStat } from "@/features/git/queries"
import { OpenWithButton } from "./open-with-button"
import {
  useShortcutHandler,
  useShortcutBinding,
} from "@/shared/components/keyboard-shortcuts-provider"
import { SHORTCUT_ACTIONS } from "@/shared/lib/keyboard-shortcuts"
import { ShortcutKbd } from "@/shared/ui/kbd"
import { Separator } from "@/shared/ui/separator"

const activeTitleBarButtonClassName =
  "transition-[background-color,border-color,color,box-shadow] duration-150 aria-pressed:border-primary/35 aria-pressed:bg-primary/10 aria-pressed:text-primary aria-pressed:shadow-sm dark:aria-pressed:border-primary/45 dark:aria-pressed:bg-primary/20 dark:aria-pressed:text-primary-foreground"

export function TitleBar() {
  const router = useRouter()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const isSettings = pathname === "/settings"
  const { isMobile, state, toggleSidebar } = useSidebar()
  const { workspaces, setThreadTitle, deleteThread } = useWorkspace()
  const { isOpen: diffOpen, toggle: toggleDiff } = useDiffPanel()
  const { isOpen: fileTreeOpen, toggle: toggleFileTree } = useFileTree()
  const { threadId } = useParams({ strict: false }) as { threadId?: string }
  const activeThread = threadId
    ? workspaces.flatMap((w) => w.threads).find((t) => t.id === threadId)
    : undefined
  const activeWorkspace = activeThread
    ? workspaces.find((w) => w.threads.some((t) => t.id === activeThread.id))
    : undefined
  const { isOpen: terminalOpen, toggle: toggleTerminal } = useTerminalForWorkspace(
    activeWorkspace?.id ?? "",
    activeWorkspace?.path ?? ""
  )
  const activeSessionId = activeThread?.sessionId ?? ""
  const { data: platform } = useElectronPlatform()
  const { data: isFullscreen = false } = useElectronFullscreen()
  const { data: diffStat } = useGitDiffStat(activeSessionId)
  const isMac = platform === "darwin"

  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState("")
  const renameInputRef = useRef<HTMLInputElement>(null)

  const startRename = () => {
    setRenameValue(activeThread?.title ?? "")
    setIsRenaming(true)
    setTimeout(() => renameInputRef.current?.select(), 0)
  }

  const commitRename = () => {
    if (activeWorkspace && activeThread && renameValue.trim()) {
      setThreadTitle(activeWorkspace.id, activeThread.id, renameValue.trim())
    }
    setIsRenaming(false)
  }

  const handleDeleteThread = async () => {
    if (!activeWorkspace || !activeThread) return
    const workspaceId = activeWorkspace.id
    const threadIdToDelete = activeThread.id
    const remainingThreads = activeWorkspace.threads.filter(
      (t) => t.id !== threadIdToDelete
    )
    const nextThread = remainingThreads[remainingThreads.length - 1]
    await deleteThread(workspaceId, threadIdToDelete)
    if (nextThread) {
      navigate({
        to: "/workspace/$threadId",
        params: { threadId: nextThread.id },
      })
    } else {
      navigate({ to: "/" })
    }
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
    activeThread ? startRename : null
  )
  useShortcutHandler(
    SHORTCUT_ACTIONS.NAVIGATE_BACK,
    canGoBack ? () => router.history.back() : null
  )
  useShortcutHandler(
    SHORTCUT_ACTIONS.NAVIGATE_FORWARD,
    canGoForward ? () => router.history.forward() : null
  )
  useShortcutHandler(
    SHORTCUT_ACTIONS.TOGGLE_FILE_TREE,
    activeWorkspace?.path ? toggleFileTree : null
  )

  const sidebarBinding = useShortcutBinding(SHORTCUT_ACTIONS.TOGGLE_SIDEBAR)
  const backBinding = useShortcutBinding(SHORTCUT_ACTIONS.NAVIGATE_BACK)
  const forwardBinding = useShortcutBinding(SHORTCUT_ACTIONS.NAVIGATE_FORWARD)
  const diffBinding = useShortcutBinding(SHORTCUT_ACTIONS.TOGGLE_DIFF_PANEL)
  const terminalBinding = useShortcutBinding(SHORTCUT_ACTIONS.TOGGLE_TERMINAL)
  const renameBinding = useShortcutBinding(SHORTCUT_ACTIONS.RENAME_THREAD)
  const fileTreeBinding = useShortcutBinding(SHORTCUT_ACTIONS.TOGGLE_FILE_TREE)

  const navRef = useRef<HTMLDivElement>(null)
  const [navWidth, setNavWidth] = useState(0)
  const rightControlsRef = useRef<HTMLDivElement>(null)
  const [rightControlsWidth, setRightControlsWidth] = useState(0)
  useEffect(() => {
    if (!navRef.current) return
    // Seed with current value immediately
    setNavWidth(navRef.current.offsetWidth)
    // Live-track during CSS transitions (borderBoxSize includes padding)
    const observer = new ResizeObserver((entries) => {
      const size = entries[0]?.borderBoxSize?.[0]
      if (size) setNavWidth(size.inlineSize)
    })
    observer.observe(navRef.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!rightControlsRef.current) return
    setRightControlsWidth(rightControlsRef.current.offsetWidth)
    const observer = new ResizeObserver((entries) => {
      const size = entries[0]?.borderBoxSize?.[0]
      if (size) setRightControlsWidth(size.inlineSize)
    })
    observer.observe(rightControlsRef.current)
    return () => observer.disconnect()
  }, [])

  const titleOffsetWidth = isMobile
    ? navWidth
    : state === "expanded"
      ? "var(--sidebar-width)"
      : `${navWidth}px`

  return (
    <div
      className="sticky top-0 z-20 flex h-12 shrink-0 items-center bg-transparent"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      {/* Nav controls — absolutely positioned so they never move */}
      <div
        ref={navRef}
        className={`absolute inset-y-0 left-0 flex items-center gap-1 transition-[padding-left] duration-500 ease-in-out ${
          isMac && !isFullscreen ? "pl-20" : "pl-4"
        }`}
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <Tooltip>
          <TooltipTrigger render={<SidebarTrigger />} />
          <TooltipContent>
            Toggle sidebar{" "}
            <ShortcutKbd binding={sidebarBinding} className="ml-1" />
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => router.history.back()}
                disabled={!canGoBack}
              >
                <ChevronLeft />
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
                variant="outline"
                size="icon-sm"
                onClick={() => router.history.forward()}
                disabled={!canGoForward}
              >
                <ChevronRight />
                <span className="sr-only">Go forward</span>
              </Button>
            }
          />
          <TooltipContent>
            Go forward <ShortcutKbd binding={forwardBinding} className="ml-1" />
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Animated spacer — tracks sidebar width; never collapses past nav controls */}
      <div
        className="shrink-0 transition-[width] duration-200 ease-linear"
        style={{
          width: titleOffsetWidth,
          minWidth: navWidth,
        }}
      />

      {/* Thread title — left edge follows the sidebar (or nav controls in fullscreen) */}
      {activeThread && (
        <div
          className="flex min-w-0 flex-1 items-center gap-1 px-2"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <div className="flex min-w-0 shrink items-center gap-1">
            {activeWorkspace && (
              <>
                <span className="max-w-40 min-w-0 shrink truncate text-sm text-muted-foreground/60">
                  {activeWorkspace.name}
                </span>
                <span className="shrink-0 text-sm text-muted-foreground/40">
                  /
                </span>
              </>
            )}
            {isRenaming ? (
              <input
                ref={renameInputRef}
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename()
                  if (e.key === "Escape") setIsRenaming(false)
                }}
                className="w-48 min-w-0 bg-transparent text-sm font-medium outline-none"
              />
            ) : (
              <span className="max-w-xs min-w-0 truncate text-sm font-medium">
                {activeThread.title}
              </span>
            )}
            <Tooltip>
              <DropdownMenu>
                <TooltipTrigger
                  render={
                    <DropdownMenuTrigger className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus:ring-0 focus-visible:outline-none">
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
        </div>
      )}

      <div
        className="shrink-0"
        style={{ width: rightControlsWidth, minWidth: rightControlsWidth }}
      />

      {/* Right controls */}
      <div
        ref={rightControlsRef}
        className="absolute inset-y-0 right-0 flex items-center gap-1 pr-3"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <OpenWithButton
          workspaceId={activeWorkspace?.id}
          workspacePath={activeWorkspace?.path}
          openWithAppId={activeWorkspace?.openWithAppId}
        />
        <CommitDialog sessionId={activeThread?.sessionId ?? undefined} />

        <Separator orientation="vertical" className="mx-1" />

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="outline"
                size="icon"
                onClick={toggleTerminal}
                aria-pressed={terminalOpen}
                data-active={terminalOpen}
                className={activeTitleBarButtonClassName}
              >
                <TerminalSquare />
                <span className="sr-only">Toggle terminal</span>
              </Button>
            }
          />
          <TooltipContent>
            Toggle terminal{" "}
            <ShortcutKbd binding={terminalBinding} className="ml-1" />
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="outline"
                size="default"
                onClick={toggleDiff}
                aria-pressed={diffOpen}
                data-active={diffOpen}
                disabled={!activeWorkspace?.path}
                className={`gap-1 px-1.5 ${activeTitleBarButtonClassName}`}
              >
                <FileDiff className="size-3.5 shrink-0" />
                {diffStat &&
                  (diffStat.additions > 0 || diffStat.deletions > 0) && (
                    <span className="flex animate-in items-center gap-1 font-mono leading-none duration-200 fade-in-0 zoom-in-90">
                      <span className="text-green-500">
                        +{diffStat.additions}
                      </span>
                      <span className="text-red-500">
                        -{diffStat.deletions}
                      </span>
                    </span>
                  )}
                <span className="sr-only">Toggle diff panel</span>
              </Button>
            }
          />
          <TooltipContent>
            Toggle diff panel{" "}
            <ShortcutKbd binding={diffBinding} className="ml-1" />
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="outline"
                size="icon"
                onClick={toggleFileTree}
                aria-pressed={fileTreeOpen}
                data-active={fileTreeOpen}
                disabled={!activeWorkspace?.path}
                className={activeTitleBarButtonClassName}
              >
                <FolderTree />
                <span className="sr-only">Toggle file tree</span>
              </Button>
            }
          />
          <TooltipContent>
            Toggle file tree{" "}
            <ShortcutKbd binding={fileTreeBinding} className="ml-1" />
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}
