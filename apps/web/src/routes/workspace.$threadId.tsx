import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect } from "react"

import { ChatView } from "@/components/chat-view"
import { DiffPanel } from "@/components/diff-panel"
import { TerminalPanel } from "@/components/terminal-panel"
import { useWorkspace } from "@/hooks/workspace-context"
import { useDiffPanel } from "@/hooks/diff-panel-context"
import { useTerminal } from "@/hooks/terminal-context"

const LS_THREAD_KEY = "lambda-code:activeThreadId"

export const Route = createFileRoute("/workspace/$threadId")({
  component: WorkspaceThreadRoute,
})

function WorkspaceThreadRoute() {
  const { threadId } = Route.useParams()
  const { workspaces } = useWorkspace()
  const navigate = useNavigate()
  const { isOpen: diffOpen } = useDiffPanel()
  const { isOpen: terminalOpen } = useTerminal()

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

  const cwd = foundWorkspace.path

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Main row: chat + diff panel side by side */}
      <div className="flex min-h-0 flex-1 overflow-hidden border-t">
        <ChatView
          key={foundThread.id}
          sessionId={foundThread.sessionId}
          workspaceName={foundWorkspace.name}
          workspaceId={foundWorkspace.id}
          threadId={foundThread.id}
        />

        {diffOpen && <DiffPanel sessionId={foundThread.sessionId} />}
      </div>

      {/* Terminal panel anchored to bottom */}
      {terminalOpen && <TerminalPanel cwd={cwd} />}
    </div>
  )
}
