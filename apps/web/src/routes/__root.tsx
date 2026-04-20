import { createRootRoute, Outlet, useParams } from "@tanstack/react-router"

import { AppSidebar } from "@/features/workspace"
import { TitleBar } from "@/features/layout"
import { SidebarInset, SidebarProvider } from "@/shared/ui/sidebar"
import { TooltipProvider } from "@/shared/ui/tooltip"
import { WorkspaceProvider, useWorkspace } from "@/features/workspace"
import { TerminalProvider } from "@/features/terminal"
import { DiffPanelProvider } from "@/features/git"
import {
  ThreadStatusProvider,
  useGlobalThreadStatusWatcher,
} from "@/features/chat"
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

function RootLayoutInner() {
  const { isLoading } = useWorkspace()
  const { threadId: activeThreadId } = useParams({ strict: false }) as {
    threadId?: string
  }
  useGlobalThreadStatusWatcher(activeThreadId)

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
            <Outlet />
          </SidebarInset>
        </div>
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
    <ConfigureProviderProvider>
      <SettingsModalProvider>
        <WorkspaceProvider>
          <ThreadStatusProvider>
            <TerminalProvider>
              <DiffPanelProvider>
                <RootLayoutInner />
                <SettingsModal />
                <ConfigureProviderModal />
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
    </ErrorBoundary>
  )
}

export const Route = createRootRoute({ component: Root })
