import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { lazy, Suspense, useEffect, useRef } from "react"

import { ChatView, useSetActiveThreadId } from "@/features/chat"
import { useWorkspace } from "@/features/workspace"
import { useDiffPanel } from "@/features/git"
import { useFileTree } from "@/features/file-tree"
import { useUpdateAppSetting } from "@/features/settings/mutations"
import { useUpdateThreadLastAccessed } from "@/features/workspace/mutations"
import { APP_SETTINGS_KEYS } from "@/shared/lib/storage-keys"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/shared/ui/resizable"
import { cn } from "@/shared/lib/utils"

const DiffPanel = lazy(() =>
  import("@/features/git").then((module) => ({
    default: module.DiffPanel,
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
  const {
    isOpen: diffOpen,
    isFullscreen: diffFullscreen,
    setCurrentWorkspace,
  } = useDiffPanel()
  const { isOpen: fileTreeOpen } = useFileTree()
  const { mutate: updateSetting } = useUpdateAppSetting()
  const { mutate: updateLastAccessed } = useUpdateThreadLastAccessed()
  const setActiveThreadId = useSetActiveThreadId()

  // Set active thread when viewing this thread
  useEffect(() => {
    setActiveThreadId(threadId)
    return () => {
      // Clear active thread when navigating away
      setActiveThreadId(null)
    }
  }, [threadId, setActiveThreadId])

  // Find current workspace
  const foundWorkspace = workspaces.find((ws) =>
    ws.threads.some((t) => t.id === threadId)
  )
  const foundThread = foundWorkspace?.threads.find((t) => t.id === threadId)

  // Set workspace path in diff panel context for breadcrumb navigation
  const currentPathRef = useRef<string | null>(null)
  useEffect(() => {
    const newPath = foundWorkspace?.path ?? null
    if (newPath !== currentPathRef.current) {
      currentPathRef.current = newPath
      setCurrentWorkspace(newPath)
    }
    return () => {
      currentPathRef.current = null
    }
  }, [foundWorkspace?.path, setCurrentWorkspace])

  useEffect(() => {
    updateSetting({
      key: APP_SETTINGS_KEYS.ACTIVE_THREAD_ID,
      value: threadId,
    })
    updateLastAccessed(threadId)
  }, [threadId, updateSetting, updateLastAccessed])

  useEffect(() => {
    if (!isLoading && !foundThread) {
      navigate({ to: "/" })
    }
  }, [isLoading, foundThread, navigate])

  if (!foundWorkspace || !foundThread || !foundThread.sessionId) {
    return null
  }

  if (diffFullscreen) {
    return (
      <div className="flex h-full border-t">
        <div className="flex min-w-0 flex-1">
          <Suspense fallback={<div className="h-full flex-1 bg-muted/10" />}>
            <DiffPanel
              sessionId={foundThread.sessionId}
              openWithAppId={foundWorkspace.openWithAppId}
            />
          </Suspense>
        </div>
        {fileTreeOpen && (
          <div className="h-full w-56 shrink-0 border-l border-sidebar-border">
            <FileTree
              workspaceId={foundWorkspace.id}
              workspacePath={foundWorkspace.path}
            />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={cn("flex h-full border-t", diffFullscreen && "h-full")}>
      <ResizablePanelGroup orientation="horizontal" className="flex-1">
        <ResizablePanel defaultSize={diffOpen ? "50" : "100"} minSize="50">
          <ChatView
            key={foundThread.sessionId}
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
            <ResizablePanel defaultSize="45" minSize="40">
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

      {fileTreeOpen && (
        <div className="h-full w-56 shrink-0 border-l border-sidebar-border">
          <FileTree
            workspaceId={foundWorkspace.id}
            workspacePath={foundWorkspace.path}
          />
        </div>
      )}
    </div>
  )
}
