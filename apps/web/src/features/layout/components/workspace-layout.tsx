import React, {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"
import { Outlet, useParams, useRouterState, useSearch } from "@tanstack/react-router"

import { AppSidebar, useWorkspace } from "@/features/workspace"
import { TitleBar } from "./title-bar"
import { RightSidebarContent } from "./right-sidebar"
import { useRightSidebar } from "../store/right-sidebar"
import { useLeftSidebarStore } from "../store/left-sidebar"
import { SidebarInset, SidebarProvider } from "@/shared/ui/sidebar"
import { TooltipProvider } from "@/shared/ui/tooltip"
import { useTerminal } from "@/features/terminal"
import { useReviewPanel } from "@/features/git"
import { useIsMobile } from "@/shared/hooks/use-mobile"
import { usePrefetchThreadsMessages } from "@/features/chat/hooks"
import { CommandPalette } from "@/features/command-palette"
import { SplashScreen } from "@/shared/components/splash-screen"
import { cn } from "@/shared/lib/utils"
import { useShortcutHandler } from "@/shared/components/keyboard-shortcuts-provider"
import { SHORTCUT_ACTIONS } from "@/shared/lib/keyboard-shortcuts"

const TerminalPanel = lazy(() =>
  import("@/features/terminal").then((m) => ({ default: m.TerminalPanel }))
)

// Smallest the central chat/editor column may shrink to. Both the right
// sidebar's resize gutter and the window-resize layout clamp against this so
// the chat panel always stays usable.
const MIN_CHAT_PANEL_WIDTH = 420

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
  const leftSidebarOpen = useLeftSidebarStore((s) => s.isOpen)
  const setLeftSidebarOpen = useLeftSidebarStore((s) => s.setOpen)

  const isMobile = useIsMobile(900)
  const leftSidebarRef = useRef<HTMLDivElement>(null)
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(256)
  const isLeftSidebarDragging = useRef(false)
  const leftSidebarDragStartX = useRef(0)
  const leftSidebarDragStartWidth = useRef(0)
  const isDragging = useRef(false)
  const dragStartX = useRef(0)
  const dragStartWidth = useRef(0)
  const sidebarRef = useRef<HTMLDivElement>(null)

  const [terminalHeight, setTerminalHeight] = useState(256)
  const isTerminalDragging = useRef(false)
  const terminalDragStartY = useRef(0)
  const terminalDragStartHeight = useRef(0)

  const handleLeftSidebarResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      isLeftSidebarDragging.current = true
      leftSidebarDragStartX.current = e.clientX
      leftSidebarDragStartWidth.current = leftSidebarWidth

      const sidebarGap =
        leftSidebarRef.current?.querySelector<HTMLElement>(
          '[data-slot="sidebar-gap"]'
        ) ?? null
      const sidebarContainer =
        leftSidebarRef.current?.querySelector<HTMLElement>(
          '[data-slot="sidebar-container"]'
        ) ?? null
      sidebarGap?.style.setProperty("transition", "none")
      sidebarContainer?.style.setProperty("transition", "none")

      const onMove = (ev: MouseEvent) => {
        if (!isLeftSidebarDragging.current) return
        const delta = ev.clientX - leftSidebarDragStartX.current
        const next = Math.max(
          200,
          Math.min(480, leftSidebarDragStartWidth.current + delta)
        )
        // Update only the two elements whose geometry changes. Mutating the
        // provider's CSS variable here would invalidate styles across the
        // entire workspace (including Monaco and terminal descendants).
        sidebarGap?.style.setProperty("width", `${next}px`)
        sidebarContainer?.style.setProperty("width", `${next}px`)
      }

      const onUp = (ev: MouseEvent) => {
        isLeftSidebarDragging.current = false
        document.removeEventListener("mousemove", onMove)
        document.removeEventListener("mouseup", onUp)
        document.body.style.cursor = ""
        document.body.style.userSelect = ""

        const delta = ev.clientX - leftSidebarDragStartX.current
        const finalWidth = Math.max(
          200,
          Math.min(480, leftSidebarDragStartWidth.current + delta)
        )
        leftSidebarRef.current?.style.setProperty(
          "--sidebar-width",
          `${finalWidth}px`
        )
        sidebarGap?.style.removeProperty("width")
        sidebarContainer?.style.removeProperty("width")
        sidebarGap?.style.removeProperty("transition")
        sidebarContainer?.style.removeProperty("transition")
        setLeftSidebarWidth(finalWidth)
      }

      document.body.style.cursor = "col-resize"
      document.body.style.userSelect = "none"
      document.addEventListener("mousemove", onMove)
      document.addEventListener("mouseup", onUp)
    },
    [leftSidebarWidth]
  )

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      isDragging.current = true
      dragStartX.current = e.clientX
      dragStartWidth.current = rightSidebarWidth
      // Suppress the open/close width animation while dragging so resize tracks
      // the cursor 1:1 instead of easing toward each new width.
      if (sidebarRef.current) sidebarRef.current.style.transition = "none"

      // Cap the sidebar so the chat panel never drops below its minimum width.
      const containerWidth =
        sidebarRef.current?.parentElement?.clientWidth ?? Infinity
      const maxWidth = Math.min(
        800,
        Math.max(240, containerWidth - MIN_CHAT_PANEL_WIDTH)
      )

      const onMove = (ev: MouseEvent) => {
        if (!isDragging.current) return
        const delta = dragStartX.current - ev.clientX
        const next = Math.max(
          240,
          Math.min(maxWidth, dragStartWidth.current + delta)
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
          Math.min(maxWidth, dragStartWidth.current + delta)
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
      <SidebarProvider
        ref={leftSidebarRef}
        open={leftSidebarOpen}
        onOpenChange={setLeftSidebarOpen}
        style={
          {
            "--sidebar-width": `${leftSidebarWidth}px`,
          } as React.CSSProperties
        }
        className="h-svh bg-sidebar"
      >
        {/* Draggable window strip behind the titlebar island (frameless
            window). The island's controls opt out with no-drag. */}
        <div
          className="fixed inset-x-0 top-0 z-0 h-13"
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        />
        <TitleBar />
        <AppSidebar onResizeStart={handleLeftSidebarResizeStart} />

        <div className="relative z-20 flex min-w-0 flex-1 overflow-hidden pt-13 pr-2 pb-2 peer-data-[state=collapsed]:pl-2">
          {/* Editor column: the editor island and (when open) a separate
              terminal island stacked below it, with a resize gutter as the gap.
              Chrome lives in the unified titlebar island above. */}
          <div
            className="flex h-full flex-1 flex-col overflow-hidden"
            style={{
              display: diffFullscreen ? "none" : undefined,
              minWidth: MIN_CHAT_PANEL_WIDTH,
            }}
          >
            <SidebarInset className="min-h-0 w-full flex-1 overflow-hidden rounded-2xl border border-border shadow-md">
              <div className="min-h-0 flex-1 overflow-hidden">
                <MainContentArea />
              </div>
            </SidebarInset>

            {terminalHost && anyTerminalTabs && (
              <>
                {/* Resize gutter — doubles as the gap between the islands. */}
                <div
                  onMouseDown={handleTerminalResizeStart}
                  className="group relative h-2 shrink-0 cursor-row-resize"
                  style={{ display: activeTerminalOpen ? undefined : "none" }}
                >
                  <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-transparent transition-colors group-hover:bg-border" />
                </div>
                {/* Terminal island */}
                <div
                  className="shrink-0 overflow-hidden rounded-2xl border border-border bg-background shadow-md"
                  style={{
                    height: terminalHeight,
                    display: activeTerminalOpen ? undefined : "none",
                  }}
                >
                  <Suspense fallback={<div className="h-full bg-background" />}>
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
              </>
            )}
          </div>

          {/* Right sidebar — outside the card, mirrors AppSidebar on the left */}
          {rsReady && (
            <>
              {!isMobile && rightSidebarOpen && !diffFullscreen && (
                <div
                  onMouseDown={handleResizeStart}
                  className="group relative z-30 w-2 shrink-0 cursor-col-resize"
                >
                  <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors group-hover:bg-border" />
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
