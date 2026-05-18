import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect, useMemo, useRef } from "react"

import { ChatView, useSetActiveThreadId } from "@/features/chat"
import { useWorkspace, useWorkspaces } from "@/features/workspace"
import { useDiffPanel } from "@/features/git"
import { useMainTabs, useMainTabsStore } from "@/features/main-tabs"
import { useUpdateAppSetting } from "@/features/settings/mutations"
import { useUpdateThreadLastAccessed } from "@/features/workspace/mutations"
import { APP_SETTINGS_KEYS } from "@/shared/lib/storage-keys"
import { Skeleton } from "@/shared/ui/skeleton"

export const Route = createFileRoute("/workspace/$threadId")({
  component: WorkspaceThreadRoute,
})

function WorkspaceThreadRoute() {
  const { threadId } = Route.useParams()
  const { workspaces, isLoading } = useWorkspace()
  const { isFetching } = useWorkspaces()
  const navigate = useNavigate()
  const { isFullscreen: diffFullscreen, setCurrentWorkspace } = useDiffPanel()
  const { mutate: updateSetting } = useUpdateAppSetting()
  const { mutate: updateLastAccessed } = useUpdateThreadLastAccessed()
  const setActiveThreadId = useSetActiveThreadId()
  const { addThreadTab, updateThreadTitle } = useMainTabs()

  // Set active thread when viewing this thread
  useEffect(() => {
    setActiveThreadId(threadId)
    return () => {
      setActiveThreadId(null)
    }
  }, [threadId, setActiveThreadId])

  // Find current workspace and thread
  const foundWorkspace = useMemo(
    () => workspaces.find((ws) => ws.threads.some((t) => t.id === threadId)),
    [workspaces, threadId]
  )
  const foundThread = useMemo(
    () => foundWorkspace?.threads.find((t) => t.id === threadId),
    [foundWorkspace, threadId]
  )

  // Set workspace path in diff panel context for breadcrumb navigation
  const currentPathRef = useRef<string | null>(null)
  useEffect(() => {
    const newPath = foundWorkspace?.path ?? null
    if (newPath !== currentPathRef.current) {
      currentPathRef.current = newPath
      setCurrentWorkspace(newPath ?? "")
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

  // Register thread tab when this route mounts (handles initial URL load)
  useEffect(() => {
    if (foundThread) {
      addThreadTab(foundThread.id, foundThread.title)
    }
  }, [foundThread, addThreadTab])

  // Keep tab title in sync when thread is renamed
  useEffect(() => {
    if (foundThread) {
      updateThreadTitle(foundThread.id, foundThread.title)
    }
  }, [foundThread, updateThreadTitle])

  // Check if the thread is already registered in the tab store (e.g. just forked).
  // This prevents a premature redirect when workspace data hasn't propagated yet.
  const isTabKnown = useMainTabsStore((s) =>
    s.tabs.some((t) => t.type === "thread" && t.threadId === threadId)
  )

  useEffect(() => {
    if (!isLoading && !isFetching && !foundThread && !isTabKnown) {
      navigate({ to: "/" })
    }
  }, [isLoading, isFetching, foundThread, isTabKnown, navigate])

  const isContentReady =
    !!foundWorkspace && !!foundThread && !!foundThread.sessionId

  // In fullscreen mode MainContentArea owns the layout; return null so this
  // component stays mounted (keeping effects alive) without rendering content.
  if (diffFullscreen) return null

  return isContentReady ? (
    <ChatView
      sessionId={foundThread.sessionId!}
      workspaceId={foundWorkspace.id}
      threadId={foundThread.id}
      initialModelId={foundThread.modelId}
      initialIsStopped={foundThread.isStopped}
    />
  ) : (
    <ChatViewSkeleton />
  )
}

function ChatViewSkeleton() {
  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <div className="flex w-full flex-1 flex-col overflow-hidden pt-6 pb-4">
        <div className="mx-auto w-full max-w-3xl space-y-6 px-6">
          <div className="space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
          <div className="space-y-2 pl-8">
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-4/6" />
            <Skeleton className="h-4 w-3/6" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        </div>
      </div>
      <div className="mx-auto w-full max-w-3xl shrink-0 px-6 py-2">
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>
    </div>
  )
}
