import { createRootRoute, Outlet } from "@tanstack/react-router"
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools"

import { AppSidebar } from "@/components/app-sidebar"
import { TitleBar } from "@/components/title-bar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { WorkspaceProvider, useWorkspace } from "@/hooks/workspace-context"
import { TerminalProvider } from "@/hooks/terminal-context"
import { DiffPanelProvider } from "@/hooks/diff-panel-context"

function RootLayoutInner() {
  const { isLoading } = useWorkspace()

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
      <TanStackRouterDevtools />
    </TooltipProvider>
  )
}

const RootLayout = () => (
  <WorkspaceProvider>
    <TerminalProvider>
      <DiffPanelProvider>
        <RootLayoutInner />
      </DiffPanelProvider>
    </TerminalProvider>
  </WorkspaceProvider>
)

export const Route = createRootRoute({ component: RootLayout })
