import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { lazy, Suspense, useEffect } from "react"

import { ChatView } from "@/features/chat"
import { useWorkspace } from "@/features/workspace"
import { useDiffPanel } from "@/features/git"
import { useTerminal } from "@/features/terminal"
import { useUpdateAppSetting } from "@/features/settings/mutations"
import { useUpdateThreadLastAccessed } from "@/features/workspace/mutations"
import { APP_SETTINGS_KEYS } from "@/shared/lib/storage-keys"

const DiffPanel = lazy(() =>
  import("@/features/git").then((module) => ({
    default: module.DiffPanel,
  }))
)

const TerminalPanel = lazy(() =>
  import("@/features/terminal").then((module) => ({
    default: module.TerminalPanel,
  }))
)

export const Route = createFileRoute("/workspace/$threadId")({
  component: WorkspaceThreadRoute,
})

function WorkspaceThreadRoute() {
  const { threadId } = Route.useParams()
  const { workspaces } = useWorkspace()
  const navigate = useNavigate()
  const { isOpen: diffOpen } = useDiffPanel()
  const { isOpen: terminalOpen } = useTerminal()
  const updateSetting = useUpdateAppSetting()
  const updateLastAccessed = useUpdateThreadLastAccessed()

  useEffect(() => {
    updateSetting.mutate({
      key: APP_SETTINGS_KEYS.ACTIVE_THREAD_ID,
      value: threadId,
    })
    updateLastAccessed.mutate(threadId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      <div className="flex min-h-0 flex-1 overflow-hidden border-t">
        <ChatView
          key={foundThread.id}
          sessionId={foundThread.sessionId}
          workspaceId={foundWorkspace.id}
          threadId={foundThread.id}
          initialModelId={foundThread.modelId}
          initialIsStopped={foundThread.isStopped}
        />

        {diffOpen && (
          <Suspense
            fallback={
              <div className="w-110 shrink-0 border-l border-border/60 bg-muted/10" />
            }
          >
            <DiffPanel sessionId={foundThread.sessionId} />
          </Suspense>
        )}
      </div>

      {terminalOpen && (
        <Suspense
          fallback={<div className="h-65 shrink-0 border-t bg-background" />}
        >
          <TerminalPanel cwd={cwd} />
        </Suspense>
      )}
    </div>
  )
}
