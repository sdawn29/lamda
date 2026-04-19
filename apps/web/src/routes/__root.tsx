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
import { ServerUnavailable, useElectronServerStatus } from "@/features/electron"
import {
  SettingsModalProvider,
  SettingsModal,
  ConfigureProviderProvider,
  ConfigureProviderModal,
} from "@/features/settings"

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

export const Route = createRootRoute({ component: RootLayoutGate })
