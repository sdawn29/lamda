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
  GitCompare,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react"
import {
  useRouter,
  useParams,
  useNavigate,
  useLocation,
} from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useWorkspace } from "@/hooks/workspace-context"
import { useTerminal } from "@/hooks/terminal-context"
import { useDiffPanel } from "@/hooks/diff-panel-context"
import { CommitDialog } from "@/components/commit-dialog"
import { useGitDiffStat } from "@/queries/use-git-diff-stat"

const isMac =
  typeof window !== "undefined" && window.electronAPI?.platform === "darwin"

function useIsFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    if (!window.electronAPI) return
    window.electronAPI.getFullscreen().then(setIsFullscreen)
    const unsub = window.electronAPI.onFullscreenChange(setIsFullscreen)
    return unsub
  }, [])

  return isFullscreen
}

export function TitleBar() {
  const router = useRouter()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const isSettings = pathname === "/settings"
  const { open } = useSidebar()
  const { workspaces, setThreadTitle, deleteThread } = useWorkspace()
  const { isOpen: terminalOpen, toggle: toggleTerminal } = useTerminal()
  const { isOpen: diffOpen, toggle: toggleDiff } = useDiffPanel()
  const { threadId } = useParams({ strict: false }) as { threadId?: string }
  const activeThread = threadId
    ? workspaces.flatMap((w) => w.threads).find((t) => t.id === threadId)
    : undefined
  const activeWorkspace = activeThread
    ? workspaces.find((w) => w.threads.some((t) => t.id === activeThread.id))
    : undefined
  const activeSessionId = activeThread?.sessionId ?? ""
  const { data: diffStat } = useGitDiffStat(activeSessionId)

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

  const isFullscreen = useIsFullscreen()

  const navRef = useRef<HTMLDivElement>(null)
  const [navWidth, setNavWidth] = useState(0)
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

  return (
    <div
      className="sticky top-0 z-20 flex h-12 shrink-0 items-center bg-transparent"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      {/* Nav controls — absolutely positioned so they never move */}
      <div
        ref={navRef}
        className={`absolute inset-y-0 left-0 flex items-center gap-1 transition-[padding-left] duration-500 ease-in-out ${
          isMac && !isFullscreen ? "pl-20" : "pl-2"
        }`}
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <Tooltip>
          <TooltipTrigger render={<SidebarTrigger />} />
          <TooltipContent>Toggle sidebar</TooltipContent>
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
          <TooltipContent>Go back</TooltipContent>
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
          <TooltipContent>Go forward</TooltipContent>
        </Tooltip>
      </div>

      {/* Animated spacer — tracks sidebar width; never collapses past nav controls */}
      <div
        className="shrink-0 transition-[width] duration-200 ease-linear"
        style={{
          width: open ? "var(--sidebar-width)" : "0px",
          minWidth: navWidth,
        }}
      />

      {/* Thread title — left edge follows the sidebar (or nav controls in fullscreen) */}
      {activeThread && (
        <div
          className="group/title flex min-w-0 flex-1 items-center gap-1 pr-6 pl-2"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <>
            {activeWorkspace && (
              <>
                <span className="shrink-0 truncate text-sm text-muted-foreground/60">
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
                className="min-w-0 flex-1 truncate bg-transparent text-sm font-medium outline-none"
              />
            ) : (
              <span className="truncate text-sm font-medium">
                {activeThread.title}
              </span>
            )}
          </>
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover/title:opacity-100 hover:bg-accent hover:text-foreground focus:opacity-100 data-popup-open:opacity-100">
              <MoreHorizontal className="size-3.5" />
              <span className="sr-only">Thread options</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={startRename}>
                <Pencil className="mr-2 h-4 w-4" />
                Rename
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
        </div>
      )}

      {/* Right controls */}
      <div
        className="absolute inset-y-0 right-0 flex items-center gap-1 pr-3"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        {!isSettings && (
          <CommitDialog sessionId={activeThread?.sessionId ?? undefined} />
        )}
        {!isSettings && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="outline"
                  size="default"
                  onClick={toggleDiff}
                  data-active={diffOpen}
                  disabled={!activeWorkspace?.path}
                  className="gap-1 px-1.5 transition-[background-color,color] duration-150 data-[active=true]:bg-accent data-[active=true]:text-accent-foreground"
                >
                  <GitCompare className="size-3.5 shrink-0" />
                  {diffStat &&
                    (diffStat.additions > 0 || diffStat.deletions > 0) && (
                      <span className="flex animate-in items-center gap-0.5 font-mono leading-none duration-200 fade-in-0 zoom-in-90">
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
            <TooltipContent>Toggle diff panel</TooltipContent>
          </Tooltip>
        )}
        {!isSettings && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="outline"
                  size="icon"
                  onClick={toggleTerminal}
                  data-active={terminalOpen}
                  className="transition-[background-color,color] duration-150 data-[active=true]:bg-accent data-[active=true]:text-accent-foreground"
                >
                  <TerminalSquare />
                  <span className="sr-only">Toggle terminal</span>
                </Button>
              }
            />
            <TooltipContent>Toggle terminal</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  )
}
