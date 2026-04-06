import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { useEffect } from "react"

import { ChatView } from "@/components/chat-view"
import { useWorkspace } from "@/hooks/workspace-context"

const LS_THREAD_KEY = "lambda-code:activeThreadId"

export const Route = createFileRoute("/thread/$threadId")({
  component: ThreadRoute,
})

function ThreadRoute() {
  const { threadId } = Route.useParams()
  const { workspaces } = useWorkspace()
  const navigate = useNavigate()

  // Persist last-visited thread for index redirect
  useEffect(() => {
    localStorage.setItem(LS_THREAD_KEY, threadId)
  }, [threadId])

  let foundWorkspace = null
  let foundThread = null
  for (const ws of workspaces) {
    const thread = ws.threads.find((t) => t.id === threadId)
    if (thread) {
      foundWorkspace = ws
      foundThread = thread
      break
    }
  }

  // If workspaces have loaded but thread is not found, redirect to index
  useEffect(() => {
    if (workspaces.length > 0 && !foundThread) {
      navigate({ to: "/" })
    }
  }, [workspaces, foundThread, navigate])

  if (!foundWorkspace || !foundThread || !foundThread.sessionId) {
    return null
  }

  return (
    <ChatView
      key={foundThread.id}
      sessionId={foundThread.sessionId}
      workspaceName={foundWorkspace.name}
      workspaceId={foundWorkspace.id}
      workspacePath={foundWorkspace.path}
      threadId={foundThread.id}
    />
  )
}
