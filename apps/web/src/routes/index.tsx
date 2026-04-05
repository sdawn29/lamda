import { createFileRoute } from "@tanstack/react-router"

import { ChatView } from "@/components/chat-view"
import { WorkspaceEmptyState } from "@/components/workspace-empty-state"
import { useWorkspace } from "@/hooks/workspace-context"

export const Route = createFileRoute("/")({
  component: Index,
})

function Index() {
  const { workspaces, activeWorkspace, activeThread } = useWorkspace()

  if (workspaces.length === 0) return <WorkspaceEmptyState />

  if (!activeWorkspace || !activeThread || !activeThread.sessionId) return null

  return (
    <ChatView
      key={activeThread.id}
      sessionId={activeThread.sessionId}
      workspaceName={activeWorkspace.name}
      workspaceId={activeWorkspace.id}
      threadId={activeThread.id}
    />
  )
}
