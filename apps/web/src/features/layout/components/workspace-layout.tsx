import React, {
  lazy,
  Suspense,
  useCallback,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import { Outlet, useParams, useRouter } from "@tanstack/react-router"
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
import { useDiffPanel } from "@/features/git"
import { useIsMobile } from "@/shared/hooks/use-mobile"
import { usePrefetchThreadsMessages } from "@/features/chat/hooks"
import {
  useElectronFullscreen,
  useElectronPlatform,
  useElectronUpdateStatus,
  useInstallUpdate,
} from "@/features/electron"
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
              className="size-6 text-muted-foreground/60 hover:text-foreground disabled:opacity-25"
            >
              <ChevronLeft className="size-3.5" />
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
              className="size-6 text-muted-foreground/60 hover:text-foreground disabled:opacity-25"
            >
              <ChevronRight className="size-3.5" />
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
  const diffBinding = useShortcutBinding(SHORTCUT_ACTIONS.TOGGLE_DIFF_PANEL)

  return (
    <div
      className="fixed top-0 right-0 z-50 flex h-11 items-center gap-0.5 px-2"
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
                "size-7 text-muted-foreground/70 hover:text-foreground",
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

export function UpdateBanner() {
  const { data: status } = useElectronUpdateStatus()
  const installUpdate = useInstallUpdate()

  if (!status || status.phase === "idle" || status.phase === "checking")
    return null

  const message = (() => {
    switch (status.phase) {
      case "available":
        return `Version ${status.version} is available — open Settings → Updates to download.`
      case "downloading":
        return `Downloading update… ${Math.round(status.percent)}%`
      case "ready":
        return `Version ${status.version} is ready to install.`
      case "error":
        return null
    }
  })()

  if (!message) return null

  return (
    <div className="flex shrink-0 items-center justify-between gap-4 border-b bg-primary/10 px-4 py-1.5 text-xs">
      <span className="text-muted-foreground">{message}</span>
      {status.phase === "ready" && (
        <button
          type="button"
          onClick={() => installUpdate.mutate()}
          className="shrink-0 rounded border px-2 py-0.5 text-xs hover:bg-muted"
        >
          Restart & install
        </button>
      )}
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
  const { isLoading, workspaces } = useWorkspace()
  const { threadId: activeThreadId } = useParams({ strict: false }) as {
    threadId?: string
  }
  const { states: terminalStates } = useTerminal()
  const { isFullscreen: diffFullscreen } = useDiffPanel()
  const {
    isOpen: rightSidebarOpen,
    isFileTreeOpen,
    toggleFileTree,
    width: rightSidebarWidth,
    setWidth: setRightSidebarWidth,
  } = useRightSidebar()

  const isMobile = useIsMobile()
  const isDragging = useRef(false)
  const dragStartX = useRef(0)
  const dragStartWidth = useRef(0)

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      isDragging.current = true
      dragStartX.current = e.clientX
      dragStartWidth.current = rightSidebarWidth

      const onMove = (ev: MouseEvent) => {
        if (!isDragging.current) return
        const delta = dragStartX.current - ev.clientX
        const next = Math.max(
          240,
          Math.min(800, dragStartWidth.current + delta)
        )
        setRightSidebarWidth(next)
      }

      const onUp = () => {
        isDragging.current = false
        document.removeEventListener("mousemove", onMove)
        document.removeEventListener("mouseup", onUp)
        document.body.style.cursor = ""
        document.body.style.userSelect = ""
      }

      document.body.style.cursor = "col-resize"
      document.body.style.userSelect = "none"
      document.addEventListener("mousemove", onMove)
      document.addEventListener("mouseup", onUp)
    },
    [rightSidebarWidth, setRightSidebarWidth]
  )

  const isEmptyState = !activeThreadId

  usePrefetchThreadsMessages({ activeThreadId })

  const activeWorkspace = workspaces.find((ws) =>
    ws.threads.some((t) => t.id === activeThreadId)
  )

  const activeTerminalOpen =
    !diffFullscreen &&
    (activeWorkspace
      ? (terminalStates[activeWorkspace.id]?.isOpen ?? false)
      : false)

  const terminalHost =
    activeWorkspace ??
    workspaces.find((ws) => (terminalStates[ws.id]?.tabs.length ?? 0) > 0)

  // Session derivation for the right sidebar — always follows the active thread
  const activeThread = activeWorkspace?.threads.find(
    (t) => t.id === activeThreadId
  )
  const rsSessionId = activeThread?.sessionId ?? null
  const rsWorkspaceId = activeWorkspace?.id
  const rsWorkspacePath = activeWorkspace?.path
  const rsOpenWithAppId = activeWorkspace?.openWithAppId ?? null
  const rsReady = !!rsSessionId

  // Workspace-stable session for git queries — only changes when the workspace changes,
  // not on every thread switch. Prevents git APIs from re-running when switching between
  // threads within the same workspace (git state is workspace-level, not per-session).
  const [rsWorkspaceSessionId, setRsWorkspaceSessionId] = useState<
    string | null
  >(null)
  const [rsTrackedWorkspaceId, setRsTrackedWorkspaceId] = useState<
    string | undefined
  >(undefined)
  if (activeWorkspace?.id !== rsTrackedWorkspaceId) {
    setRsTrackedWorkspaceId(activeWorkspace?.id)
    setRsWorkspaceSessionId(rsSessionId)
  } else if (!rsWorkspaceSessionId && rsSessionId) {
    setRsWorkspaceSessionId(rsSessionId)
  }
  const stableRsWorkspaceSessionId = rsWorkspaceSessionId ?? rsSessionId

  useShortcutHandler(
    SHORTCUT_ACTIONS.TOGGLE_FILE_TREE,
    rsWorkspacePath ? toggleFileTree : null
  )

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
          {!diffFullscreen && (
            <SidebarInset className="h-full min-h-0 w-full overflow-hidden rounded-2xl border border-border shadow-sm">
              {/* Left column: TitleBar + content + terminal */}
              <div className="flex h-full min-w-0 flex-col overflow-hidden">
                {!isEmptyState && <TitleBar />}
                <UpdateBanner />
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  <div className="min-h-0 flex-1 overflow-hidden">
                    <MainContentArea />
                  </div>
                  {activeTerminalOpen && terminalHost && (
                    <div className="h-64 shrink-0 border-t">
                      <Suspense
                        fallback={<div className="h-full bg-background" />}
                      >
                        <TerminalPanel
                          activeWorkspaceId={terminalHost.id}
                          cwd={terminalHost.path}
                        />
                      </Suspense>
                    </div>
                  )}
                </div>
              </div>
            </SidebarInset>
          )}

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
                style={
                  {
                    "--sidebar-width": isFileTreeOpen
                      ? `${rightSidebarWidth + 256}px`
                      : `${rightSidebarWidth}px`,
                  } as React.CSSProperties
                }
                className={cn(
                  "h-full min-h-0 overflow-hidden",
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
                  workspaceSessionId={stableRsWorkspaceSessionId}
                  openWithAppId={rsOpenWithAppId}
                  workspaceId={rsWorkspaceId}
                  workspacePath={rsWorkspacePath}
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
