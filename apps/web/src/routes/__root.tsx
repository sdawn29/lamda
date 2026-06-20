import { createRootRoute } from "@tanstack/react-router"
import {
  ServerUnavailable,
  useElectronServerStatus,
} from "@/features/electron"
import { WorkspaceProvider } from "@/features/workspace"
import { WorkspaceLayout } from "@/features/layout"
import { useThreadNotifications } from "@/features/chat"
import { ErrorBoundary } from "@/shared/components/error-boundary"
import { SplashScreen } from "@/shared/components/splash-screen"
import { Toaster } from "@/shared/ui/sonner"

function RootLayoutInner() {
  // Toast when any thread (foreground or not) needs approval, asks a question,
  // or errors. Lives here so it has the router + workspace data in scope.
  useThreadNotifications()
  return <WorkspaceLayout />
}

function RootLayoutGate() {
  const { data: serverStatus } = useElectronServerStatus()

  if (!serverStatus || serverStatus.status === "starting") return <SplashScreen />
  if (serverStatus.status !== "ready") {
    return <ServerUnavailable status={serverStatus} />
  }

  return (
    <WorkspaceProvider>
      <RootLayoutInner />
    </WorkspaceProvider>
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
