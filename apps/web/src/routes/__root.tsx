import { createRootRoute, Outlet, useParams } from "@tanstack/react-router"
import { lazy, Suspense, useEffect, useRef } from "react"
import type { PanelImperativeHandle } from "react-resizable-panels"

import { AppSidebar } from "@/features/workspace"
import { TitleBar } from "@/features/layout"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/shared/ui/resizable"
import { SidebarInset, SidebarProvider } from "@/shared/ui/sidebar"
import { TooltipProvider } from "@/shared/ui/tooltip"
import { WorkspaceProvider, useWorkspace } from "@/features/workspace"
import { TerminalProvider, useTerminal } from "@/features/terminal"
import { DiffPanelProvider, useDiffPanel } from "@/features/git"
import { FileTreeProvider } from "@/features/file-tree"
import { useGlobalThreadStatusWatcher } from "@/features/chat"
import { usePrefetchThreadsMessages } from "@/features/chat/hooks"
import {
  ServerUnavailable,
  useElectronServerStatus,
  useElectronUpdateStatus,
  useInstallUpdate,
} from "@/features/electron"
import { SettingsModal, ConfigureProviderModal } from "@/features/settings"
import { CommandPalette } from "@/features/command-palette"
import { ErrorBoundary } from "@/shared/components/error-boundary"
import { Toaster } from "@/shared/ui/sonner"
import { cn } from "@/shared/lib/utils"

const TerminalPanel = lazy(() =>
  import("@/features/terminal").then((module) => ({
    default: module.TerminalPanel,
  }))
)

function RootLayoutInner() {
  const { isLoading, workspaces } = useWorkspace()
  const { threadId: activeThreadId } = useParams({ strict: false }) as {
    threadId?: string
  }
  const { getState } = useTerminal()
  const { isFullscreen: diffFullscreen } = useDiffPanel()
  useGlobalThreadStatusWatcher(activeThreadId)

  // Prefetch all thread messages in the background for instant thread switching
  usePrefetchThreadsMessages({ activeThreadId })

  const activeWorkspace = workspaces.find((ws) =>
    ws.threads.some((t) => t.id === activeThreadId)
  )

  const activeTerminalState = activeWorkspace
    ? getState(activeWorkspace.id)
    : null
  // Show the terminal panel when it's open for the active workspace and diff is not fullscreen
  const activeTerminalOpen =
    !diffFullscreen && (activeTerminalState?.isOpen ?? false)

  // Keep panel mounted as long as any workspace has terminal tabs (preserves PTY processes)
  const anyWorkspaceHasTerminals = workspaces.some(
    (ws) => getState(ws.id).tabs.length > 0
  )

  const terminalPanelRef = useRef<PanelImperativeHandle>(null)

  // When there is no active workspace (e.g. home page), fall back to the first workspace
  // that has terminal tabs so TerminalPanel stays mounted and PTY processes stay alive.
  const terminalHost =
    activeWorkspace ?? workspaces.find((ws) => getState(ws.id).tabs.length > 0)

  // Programmatically expand/collapse the panel when the active workspace's terminal state changes.
  // Deferred via setTimeout so the panel has time to register its constraints with the group
  // before expand()/collapse() is called (calling them synchronously after mount throws).
  useEffect(() => {
    const panel = terminalPanelRef.current
    if (!panel) return
    const id = setTimeout(() => {
      if (activeTerminalOpen) {
        panel.expand()
      } else {
        panel.collapse()
      }
    }, 0)
    return () => clearTimeout(id)
  }, [activeTerminalOpen])

  if (isLoading) {
    return
  }

  return (
    <TooltipProvider>
      <SidebarProvider className="h-svh flex-col">
        <TitleBar />
        <UpdateBanner />
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <AppSidebar />
          <SidebarInset className="min-w-0 overflow-hidden">
            <ResizablePanelGroup orientation="vertical" className="h-full">
              <ResizablePanel className="min-h-0 overflow-hidden" minSize="20">
                <Outlet />
              </ResizablePanel>
              {anyWorkspaceHasTerminals && (
                <>
                  <ResizableHandle
                    withHandle
                    className={cn(!activeTerminalOpen && "hidden")}
                  />
                  <ResizablePanel
                    panelRef={terminalPanelRef}
                    collapsible
                    collapsedSize={0}
                    defaultSize="33"
                    minSize="15"
                  >
                    {terminalHost && (
                      <Suspense
                        fallback={
                          <div className="h-full border-t bg-background" />
                        }
                      >
                        <TerminalPanel
                          activeWorkspaceId={terminalHost.id}
                          cwd={terminalHost.path}
                        />
                      </Suspense>
                    )}
                  </ResizablePanel>
                </>
              )}
            </ResizablePanelGroup>
          </SidebarInset>
        </div>
        <CommandPalette />
      </SidebarProvider>
      {/* <TanStackRouterDevtools /> */}
    </TooltipProvider>
  )
}

function RootLayoutGate() {
  const { data: serverStatus } = useElectronServerStatus()

  if (!serverStatus) return null
  if (serverStatus.status !== "ready") {
    return <ServerUnavailable status={serverStatus} />
  }

  return (
    <WorkspaceProvider>
      <TerminalProvider>
        <DiffPanelProvider>
          <FileTreeProvider>
            <RootLayoutInner />
            <SettingsModal />
            <ConfigureProviderModal />
          </FileTreeProvider>
        </DiffPanelProvider>
      </TerminalProvider>
    </WorkspaceProvider>
  )
}

function UpdateBanner() {
  const { data: status } = useElectronUpdateStatus()
  const installUpdate = useInstallUpdate()

  if (!status || status.phase === "idle" || status.phase === "checking") return null

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

function Root() {
  return (
    <ErrorBoundary>
      <RootLayoutGate />
      <Toaster position="top-center" closeButton />
    </ErrorBoundary>
  )
}

export const Route = createRootRoute({ component: Root })
