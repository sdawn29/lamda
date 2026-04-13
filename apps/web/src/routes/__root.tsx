import { createRootRoute, Outlet } from "@tanstack/react-router"

import { AppSidebar } from "@/features/workspace"
import { TitleBar } from "@/features/layout"
import { SidebarInset, SidebarProvider } from "@/shared/ui/sidebar"
import { TooltipProvider } from "@/shared/ui/tooltip"
import { WorkspaceProvider, useWorkspace } from "@/features/workspace"
import { TerminalProvider } from "@/features/terminal"
import { DiffPanelProvider } from "@/features/git"

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
      {/* <TanStackRouterDevtools /> */}
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
