import { createFileRoute } from "@tanstack/react-router"

import { ChatView } from "@/components/chat-view"
import { useWorkspace } from "@/hooks/workspace-context"

export const Route = createFileRoute("/")({
  component: Index,
})

function Index() {
  const { activeWorkspace } = useWorkspace()

  if (!activeWorkspace) return null

  return <ChatView key={activeWorkspace.id} sessionId={activeWorkspace.sessionId} />
}
