import { createFileRoute, Navigate } from "@tanstack/react-router"

import { WorkspaceEmptyState } from "@/features/workspace"
import { useWorkspace } from "@/features/workspace"
import { useAppSettings } from "@/features/settings/queries"
import { APP_SETTINGS_KEYS } from "@/shared/lib/storage-keys"

export const Route = createFileRoute("/")({
  component: Index,
})

function Index() {
  const { workspaces, isLoading: workspacesLoading } = useWorkspace()
  const { data: settings, isLoading: settingsLoading } = useAppSettings()

  if (workspacesLoading || settingsLoading) return null

  if (workspaces.length === 0) return <WorkspaceEmptyState />

  const allThreads = workspaces.flatMap((w) => w.threads)
  const savedThreadId = settings?.[APP_SETTINGS_KEYS.ACTIVE_THREAD_ID]
  const thread = allThreads.find((t) => t.id === savedThreadId) ?? allThreads[0]

  if (thread) {
    return (
      <Navigate to="/workspace/$threadId" params={{ threadId: thread.id }} />
    )
  }

  return <WorkspaceEmptyState />
}
