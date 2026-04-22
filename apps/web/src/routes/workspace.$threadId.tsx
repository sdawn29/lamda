import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { lazy, Suspense, useEffect } from "react"

import { ChatView, useSetThreadStatus } from "@/features/chat"
import { useWorkspace } from "@/features/workspace"
import { useDiffPanel } from "@/features/git"
import { useTerminal } from "@/features/terminal"
import { useFileTree } from "@/features/file-tree"
import { useUpdateAppSetting } from "@/features/settings/mutations"
import { useUpdateThreadLastAccessed } from "@/features/workspace/mutations"
import { APP_SETTINGS_KEYS } from "@/shared/lib/storage-keys"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/shared/ui/resizable"

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

const FileTree = lazy(() =>
  import("@/features/file-tree").then((module) => ({
    default: module.FileTree,
  }))
)

export const Route = createFileRoute("/workspace/$threadId")({
  component: WorkspaceThreadRoute,
})

function WorkspaceThreadRoute() {
  const { threadId } = Route.useParams()
  const { workspaces, isLoading } = useWorkspace()
  const navigate = useNavigate()
  const { isOpen: diffOpen } = useDiffPanel()
  const { isOpen: terminalOpen } = useTerminal()
  const { isOpen: fileTreeOpen } = useFileTree()
  const updateSetting = useUpdateAppSetting()
  const updateLastAccessed = useUpdateThreadLastAccessed()
  const setThreadStatus = useSetThreadStatus()

  // Find current workspace
  const foundWorkspace = workspaces.find((ws) =>
    ws.threads.some((t) => t.id === threadId)
  )
  const foundThread = foundWorkspace?.threads.find((t) => t.id === threadId)

  useEffect(() => {
    updateSetting.mutate({
      key: APP_SETTINGS_KEYS.ACTIVE_THREAD_ID,
      value: threadId,
    })
    updateLastAccessed.mutate(threadId)
    setThreadStatus(threadId, "idle")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId])

  useEffect(() => {
    if (!isLoading && !foundThread) {
      navigate({ to: "/" })
    }
  }, [isLoading, foundThread, navigate])

  if (!foundWorkspace || !foundThread || !foundThread.sessionId) {
    return null
  }

  return (
    <ResizablePanelGroup orientation="vertical" className="h-full border-t">
      <ResizablePanel defaultSize={50} minSize={50}>
        <div className="flex h-full">
          {/* Left: Chat + Diff panels in resizable group */}
          <ResizablePanelGroup orientation="horizontal" className="flex-1">
            <ResizablePanel defaultSize={diffOpen ? 50 : 100} minSize={50}>
              <ChatView
                sessionId={foundThread.sessionId}
                workspaceId={foundWorkspace.id}
                threadId={foundThread.id}
                initialModelId={foundThread.modelId}
                initialIsStopped={foundThread.isStopped}
              />
            </ResizablePanel>
            {diffOpen && (
              <>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={50} minSize={50}>
                  <Suspense
                    fallback={
                      <div className="h-full border-l border-border/60 bg-muted/10" />
                    }
                  >
                    <DiffPanel
                      sessionId={foundThread.sessionId}
                      openWithAppId={foundWorkspace.openWithAppId}
                    />
                  </Suspense>
                </ResizablePanel>
              </>
            )}
          </ResizablePanelGroup>

          {/* Right: File Tree panel (flex, not resizable) */}
          {fileTreeOpen && (
            <div className="h-full w-64 shrink-0 border-l border-border/60">
              <FileTree workspacePath={foundWorkspace.path} />
            </div>
          )}
        </div>
      </ResizablePanel>
      {terminalOpen && (
        <>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={33.33} minSize={33.33}>
            <Suspense
              fallback={<div className="h-full border-t bg-background" />}
            >
              <TerminalPanel cwd={foundWorkspace.path} />
            </Suspense>
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
  )
}