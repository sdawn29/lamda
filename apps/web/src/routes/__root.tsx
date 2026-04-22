import { createRootRoute, Outlet, useParams } from "@tanstack/react-router"

import { AppSidebar } from "@/features/workspace"
import { TitleBar } from "@/features/layout"
import { SidebarInset, SidebarProvider } from "@/shared/ui/sidebar"
import { TooltipProvider } from "@/shared/ui/tooltip"
import { WorkspaceProvider, useWorkspace } from "@/features/workspace"
import { TerminalProvider } from "@/features/terminal"
import { DiffPanelProvider } from "@/features/git"
import { FileTreeProvider } from "@/features/file-tree"
import {
  ThreadStatusProvider,
  useGlobalThreadStatusWatcher,
  ErrorToastProvider,
} from "@/features/chat"
import { usePrefetchThreadsMessages } from "@/features/chat/hooks"
import {
  ServerUnavailable,
  useElectronServerStatus,
  useElectronUpdateStatus,
  useInstallUpdate,
} from "@/features/electron"
import {
  SettingsModalProvider,
  SettingsModal,
  ConfigureProviderProvider,
  ConfigureProviderModal,
} from "@/features/settings"
import { ErrorBoundary } from "@/shared/components/error-boundary"
import { Toaster } from "@/shared/ui/sonner"

function RootLayoutInner() {
  const { isLoading } = useWorkspace()
  const { threadId: activeThreadId } = useParams({ strict: false }) as {
    threadId?: string
  }
  useGlobalThreadStatusWatcher(activeThreadId)
  
  // Prefetch all thread messages in the background for instant thread switching
  usePrefetchThreadsMessages({ activeThreadId })

  if (isLoading) {
    return
  }

  return (
    <TooltipProvider>
      <ErrorToastProvider>
      <SidebarProvider className="h-svh flex-col">
        <TitleBar />
        <UpdateBanner />
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <AppSidebar />
          <SidebarInset className="min-w-0 overflow-hidden">
            <Outlet />
          </SidebarInset>
        </div>
      </SidebarProvider>
      </ErrorToastProvider>
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
    <ConfigureProviderProvider>
      <SettingsModalProvider>
        <WorkspaceProvider>
          <ThreadStatusProvider>
            <TerminalProvider>
              <DiffPanelProvider>
                <FileTreeProvider>
                  <RootLayoutInner />
                  <SettingsModal />
                  <ConfigureProviderModal />
                </FileTreeProvider>
              </DiffPanelProvider>
            </TerminalProvider>
          </ThreadStatusProvider>
        </WorkspaceProvider>
      </SettingsModalProvider>
    </ConfigureProviderProvider>
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
