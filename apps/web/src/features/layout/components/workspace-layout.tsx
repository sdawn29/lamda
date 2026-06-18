import React, {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import {
  Outlet,
  useParams,
  useRouter,
  useRouterState,
  useSearch,
} from "@tanstack/react-router"
import { ChevronLeft, ChevronRight, PanelRight } from "lucide-react"

import { AppSidebar, useWorkspace } from "@/features/workspace"
import { TitleBar } from "./title-bar"
import { RightSidebarContent } from "./right-sidebar"
import { useRightSidebar } from "../store/right-sidebar"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/shared/ui/sidebar"
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/shared/ui/tooltip"
import { useTerminal } from "@/features/terminal"
import { useReviewPanel } from "@/features/git"
import { useIsMobile } from "@/shared/hooks/use-mobile"
import { usePrefetchThreadsMessages } from "@/features/chat/hooks"
import { useElectronFullscreen, useElectronPlatform } from "@/features/electron"
import { CommandPalette } from "@/features/command-palette"
import { SplashScreen } from "@/shared/components/splash-screen"
import { cn } from "@/shared/lib/utils"
import { Button } from "@/shared/ui/button"
import {
  useShortcutBinding,
  useShortcutHandler,
} from "@/shared/components/keyboard-shortcuts-provider"
import { SHORTCUT_ACTIONS } from "@/shared/lib/keyboard-shortcuts"
import { ShortcutKbd } from "@/shared/ui/kbd"

const TerminalPanel = lazy(() =>
  import("@/features/terminal").then((m) => ({ default: m.TerminalPanel }))
)

function NavigationControls() {
  const { data: platform } = useElectronPlatform()
  const { data: isFullscreen = false } = useElectronFullscreen()
  const isMac = platform === "darwin"

  const router = useRouter()
  const canGoBack = router.history.canGoBack()
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
  const canGoForward = useSyncExternalStore(subscribe, getSnapshot, () => false)

  const sidebarBinding = useShortcutBinding(SHORTCUT_ACTIONS.TOGGLE_SIDEBAR)
  const backBinding = useShortcutBinding(SHORTCUT_ACTIONS.NAVIGATE_BACK)
  const forwardBinding = useShortcutBinding(SHORTCUT_ACTIONS.NAVIGATE_FORWARD)

  return (
    <div
      className={cn(
        "fixed top-0 z-50 flex h-11 items-center gap-0.5 pr-2",
        isMac && !isFullscreen ? "pl-20" : "pl-2"
      )}
      style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
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
      <div className="mx-1 h-3.5 w-px shrink-0 bg-border" />
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
  )
}

function RightSidebarControls() {
  const { isOpen, toggle } = useRightSidebar()
  const diffBinding = useShortcutBinding(SHORTCUT_ACTIONS.TOGGLE_REVIEW_PANEL)

  return (
    <div
      className="fixed top-px right-0 z-60 flex h-11 items-center gap-0.5 px-2"
      style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={toggle}
              aria-pressed={isOpen}
              className={cn(
                "size-7 text-muted-foreground hover:text-foreground",
                isOpen && "bg-accent text-accent-foreground"
              )}
            >
              <PanelRight className="size-4" />
              <span className="sr-only">Toggle right sidebar</span>
            </Button>
          }
        />
        <TooltipContent>
          Toggle sidebar <ShortcutKbd binding={diffBinding} className="ml-1" />
        </TooltipContent>
      </Tooltip>
    </div>
  )
}

export function MainContentArea() {
  return (
    <div className="relative h-full overflow-hidden">
      <Outlet />
    </div>
  )
}

export function WorkspaceLayout() {
  // Derive the active layout from the *committed* matches rather than
  // useLocation(). The router updates the location store synchronously at the
  // start of a navigation (before the new route's matches commit inside the
  // transition), so reading pathname here would flip this branch a frame
  // before the <Outlet /> swaps — briefly rendering the previous page's
  // content without its chrome. Committed matches stay in lockstep with the
  // Outlet, eliminating that flash.
  const isSettingsRoute = useRouterState({
    select: (s) => s.matches.some((m) => m.routeId === "/settings"),
  })
  const isOnboardRoute = useRouterState({
    select: (s) => s.matches.some((m) => m.routeId === "/onboard"),
  })
  const { isLoading, workspaces } = useWorkspace()
  const { threadId: activeThreadId } = useParams({ strict: false }) as {
    threadId?: string
  }
  const { states: terminalStates, syncCwd: syncTerminalCwd } = useTerminal()
  const { isFullscreen: diffFullscreen } = useReviewPanel()
  const {
    isOpen: rightSidebarOpen,
    toggleFileTree,
    width: rightSidebarWidth,
    setWidth: setRightSidebarWidth,
  } = useRightSidebar()

  const isMobile = useIsMobile(900)
  const isDragging = useRef(false)
  const dragStartX = useRef(0)
  const dragStartWidth = useRef(0)
  const sidebarRef = useRef<HTMLDivElement>(null)

  const [terminalHeight, setTerminalHeight] = useState(256)
  const isTerminalDragging = useRef(false)
  const terminalDragStartY = useRef(0)
  const terminalDragStartHeight = useRef(0)

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      isDragging.current = true
      dragStartX.current = e.clientX
      dragStartWidth.current = rightSidebarWidth
      // Suppress the open/close width animation while dragging so resize tracks
      // the cursor 1:1 instead of easing toward each new width.
      if (sidebarRef.current) sidebarRef.current.style.transition = "none"

      const onMove = (ev: MouseEvent) => {
        if (!isDragging.current) return
        const delta = dragStartX.current - ev.clientX
        const next = Math.max(
          240,
          Math.min(800, dragStartWidth.current + delta)
        )
        // Bypass React re-renders during drag — update the CSS variable directly
        if (sidebarRef.current) {
          sidebarRef.current.style.setProperty("--sidebar-width", `${next}px`)
        }
      }

      const onUp = (ev: MouseEvent) => {
        isDragging.current = false
        document.removeEventListener("mousemove", onMove)
        document.removeEventListener("mouseup", onUp)
        document.body.style.cursor = ""
        document.body.style.userSelect = ""
        // Restore the class-based width transition for subsequent open/close.
        if (sidebarRef.current) sidebarRef.current.style.transition = ""
        // Commit final width to React state exactly once
        const delta = dragStartX.current - ev.clientX
        const finalWidth = Math.max(
          240,
          Math.min(800, dragStartWidth.current + delta)
        )
        setRightSidebarWidth(finalWidth)
      }

      document.body.style.cursor = "col-resize"
      document.body.style.userSelect = "none"
      document.addEventListener("mousemove", onMove)
      document.addEventListener("mouseup", onUp)
    },
    [rightSidebarWidth, setRightSidebarWidth]
  )

  const handleTerminalResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      isTerminalDragging.current = true
      terminalDragStartY.current = e.clientY
      terminalDragStartHeight.current = terminalHeight

      const onMove = (ev: MouseEvent) => {
        if (!isTerminalDragging.current) return
        const delta = terminalDragStartY.current - ev.clientY
        const next = Math.max(
          80,
          Math.min(800, terminalDragStartHeight.current + delta)
        )
        setTerminalHeight(next)
      }

      const onUp = () => {
        isTerminalDragging.current = false
        document.removeEventListener("mousemove", onMove)
        document.removeEventListener("mouseup", onUp)
        document.body.style.cursor = ""
        document.body.style.userSelect = ""
      }

      document.body.style.cursor = "row-resize"
      document.body.style.userSelect = "none"
      document.addEventListener("mousemove", onMove)
      document.addEventListener("mouseup", onUp)
    },
    [terminalHeight]
  )

  usePrefetchThreadsMessages()

  const { ws: newThreadWsId } = useSearch({ strict: false }) as { ws?: string }

  const activeWorkspace = workspaces.find((ws) =>
    ws.threads.some((t) => t.id === activeThreadId)
  )

  // On /new, fall back to the ?ws= workspace so the right sidebar can open
  const rsWorkspace =
    activeWorkspace ??
    (newThreadWsId ? workspaces.find((w) => w.id === newThreadWsId) : undefined)

  const terminalHost =
    activeWorkspace ??
    workspaces.find((ws) => terminalStates[ws.id]?.isOpen) ??
    workspaces.find((ws) => (terminalStates[ws.id]?.tabs.length ?? 0) > 0)

  const activeTerminalOpen =
    !diffFullscreen &&
    (terminalHost ? (terminalStates[terminalHost.id]?.isOpen ?? false) : false)

  // Keep the terminal panel mounted as long as any workspace has live tabs, so
  // switching threads between workspaces doesn't tear down PTYs that are still
  // running. The panel is hidden (not unmounted) when the active workspace's
  // terminal isn't open.
  const anyTerminalTabs = Object.values(terminalStates).some(
    (s) => s.tabs.length > 0
  )

  // Session derivation for the right sidebar — follows the active thread, or any
  // thread from the /new-page workspace (git state is workspace-level).
  const activeThread = activeWorkspace?.threads.find(
    (t) => t.id === activeThreadId
  )
  const activeWorkspaceId = activeWorkspace?.id
  // When the active thread runs in a git worktree, the review panel and file
  // tree must follow it into that worktree rather than showing the workspace.
  const activeWorktreePath = activeThread?.worktreePath ?? null
  const activeTerminalCwd = activeWorktreePath ?? activeWorkspace?.path
  const activeWorkspaceTerminalOpen = activeWorkspaceId
    ? (terminalStates[activeWorkspaceId]?.isOpen ?? false)
    : false

  useEffect(() => {
    if (
      !activeWorkspaceId ||
      !activeTerminalCwd ||
      !activeWorkspaceTerminalOpen
    ) {
      return
    }
    syncTerminalCwd(activeWorkspaceId, activeTerminalCwd)
  }, [
    activeWorkspaceId,
    activeTerminalCwd,
    activeWorkspaceTerminalOpen,
    syncTerminalCwd,
  ])
  const rsSessionId =
    activeThread?.sessionId ??
    rsWorkspace?.threads.find((t) => t.sessionId)?.sessionId ??
    null
  const rsWorkspaceId = rsWorkspace?.id
  // Effective tree/file root — the worktree dir for a worktree thread, else the
  // workspace path.
  const rsWorkspacePath = activeWorktreePath ?? rsWorkspace?.path
  const rsOpenWithAppId = rsWorkspace?.openWithAppId ?? null
  const rsReady = !!rsSessionId || !!rsWorkspace

  // Workspace-stable session for git queries — only changes when the workspace changes,
  // not on every thread switch. Prevents git APIs from re-running when switching between
  // threads within the same workspace (git state is workspace-level, not per-session).
  const [rsWorkspaceSessionId, setRsWorkspaceSessionId] = useState<
    string | null
  >(null)
  const [rsTrackedWorkspaceId, setRsTrackedWorkspaceId] = useState<
    string | undefined
  >(undefined)
  if (rsWorkspace?.id !== rsTrackedWorkspaceId) {
    setRsTrackedWorkspaceId(rsWorkspace?.id)
    setRsWorkspaceSessionId(rsSessionId)
  } else if (!rsWorkspaceSessionId && rsSessionId) {
    setRsWorkspaceSessionId(rsSessionId)
  }
  const stableRsWorkspaceSessionId = rsWorkspaceSessionId ?? rsSessionId

  // Git state is workspace-level only for *local* threads — hence the stable
  // workspace session above. A thread in a worktree has its own, thread-specific
  // git state (the server resolves that session's cwd to the worktree), so the
  // review panel must query through the active thread's own session instead.
  const rsGitSessionId = activeWorktreePath
    ? (activeThread?.sessionId ?? stableRsWorkspaceSessionId)
    : stableRsWorkspaceSessionId

  useShortcutHandler(
    SHORTCUT_ACTIONS.TOGGLE_FILE_TREE,
    rsWorkspacePath ? toggleFileTree : null
  )

  if (isSettingsRoute) {
    return (
      <TooltipProvider>
        <Outlet />
      </TooltipProvider>
    )
  }

  if (isOnboardRoute) {
    return (
      <div className="relative h-svh">
        {/* Draggable top strip so the frameless window can be moved */}
        <div
          className="absolute inset-x-0 top-0 z-10 h-11"
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        />
        <Outlet />
      </div>
    )
  }

  if (isLoading) {
    return <SplashScreen />
  }

  return (
    <TooltipProvider>
      <SidebarProvider className="h-svh bg-sidebar">
        <NavigationControls />
        <RightSidebarControls />
        <AppSidebar />

        <div className="relative z-20 flex min-w-0 flex-1 overflow-hidden">
          <SidebarInset
            className="h-full min-h-0 w-full overflow-hidden rounded-2xl border border-border shadow-sm"
            style={{ display: diffFullscreen ? "none" : undefined }}
          >
            {/* Left column: TitleBar + content + terminal */}
            <div className="flex h-full min-w-0 flex-col overflow-hidden">
              <TitleBar />
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="min-h-0 flex-1 overflow-hidden">
                  <MainContentArea />
                </div>
                {terminalHost && anyTerminalTabs && (
                  <div
                    onMouseDown={handleTerminalResizeStart}
                    className="shrink-0 cursor-row-resize border-t"
                    style={{
                      height: terminalHeight,
                      display: activeTerminalOpen ? undefined : "none",
                    }}
                  >
                    <Suspense
                      fallback={<div className="h-full bg-background" />}
                    >
                      <TerminalPanel
                        activeWorkspaceId={terminalHost.id}
                        cwd={
                          terminalHost.id === activeWorkspaceId
                            ? (activeTerminalCwd ?? terminalHost.path)
                            : terminalHost.path
                        }
                      />
                    </Suspense>
                  </div>
                )}
              </div>
            </div>
          </SidebarInset>

          {/* Right sidebar — outside the card, mirrors AppSidebar on the left */}
          {rsReady && (
            <>
              {!isMobile && rightSidebarOpen && !diffFullscreen && (
                <div
                  onMouseDown={handleResizeStart}
                  className="group relative z-30 w-1 shrink-0 cursor-col-resize"
                >
                  <div className="absolute inset-y-0 left-0 w-px bg-transparent" />
                </div>
              )}
              <SidebarProvider
                ref={sidebarRef}
                style={
                  {
                    "--sidebar-width": `${rightSidebarWidth}px`,
                  } as React.CSSProperties
                }
                className={cn(
                  "h-full min-h-0 overflow-hidden transition-[width] duration-200 ease-linear",
                  isMobile
                    ? "hidden"
                    : diffFullscreen
                      ? "flex-1"
                      : rightSidebarOpen
                        ? "w-(--sidebar-width) flex-none"
                        : "w-0 flex-none"
                )}
              >
                <RightSidebarContent
                  sessionId={rsSessionId}
                  workspaceSessionId={rsGitSessionId}
                  openWithAppId={rsOpenWithAppId}
                  workspaceId={rsWorkspaceId}
                  workspacePath={rsWorkspacePath}
                  treeThreadId={activeThread?.id}
                />
              </SidebarProvider>
            </>
          )}
        </div>

        <CommandPalette />
      </SidebarProvider>
    </TooltipProvider>
  )
}
