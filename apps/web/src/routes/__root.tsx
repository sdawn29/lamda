import { createRootRoute } from "@tanstack/react-router"
import {
  ServerUnavailable,
  useElectronServerStatus,
} from "@/features/electron"
import { SettingsModal, ConfigureProviderModal } from "@/features/settings"
import { WorkspaceProvider } from "@/features/workspace"
import { WorkspaceLayout } from "@/features/layout"
import { ErrorBoundary } from "@/shared/components/error-boundary"
import { SplashScreen } from "@/shared/components/splash-screen"
import { Toaster } from "@/shared/ui/sonner"

function RootLayoutInner() {
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
      <SettingsModal />
      <ConfigureProviderModal />
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
