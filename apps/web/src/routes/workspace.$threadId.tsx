import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect, useMemo, useRef } from "react"

import { useSetActiveThreadId, ChatView } from "@/features/chat"
import { useWorkspace, useWorkspaces } from "@/features/workspace"
import { useDiffPanel } from "@/features/git"
import { useUpdateAppSetting } from "@/features/settings/mutations"
import { useUpdateThreadLastAccessed } from "@/features/workspace/mutations"
import { APP_SETTINGS_KEYS } from "@/shared/lib/storage-keys"
import { Skeleton } from "@/shared/ui/skeleton"

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

export const Route = createFileRoute("/workspace/$threadId")({
  component: WorkspaceThreadRoute,
})

function WorkspaceThreadRoute() {
  const { threadId } = Route.useParams()
  const { workspaces, isLoading } = useWorkspace()
  const { isFetching } = useWorkspaces()
  const navigate = useNavigate()
  const { setCurrentWorkspace } = useDiffPanel()
  const { mutate: updateSetting } = useUpdateAppSetting()
  const { mutate: updateLastAccessed } = useUpdateThreadLastAccessed()
  const setActiveThreadId = useSetActiveThreadId()

  const foundWorkspace = useMemo(
    () => workspaces.find((ws) => ws.threads.some((t) => t.id === threadId)),
    [workspaces, threadId]
  )
  const foundThread = useMemo(
    () => foundWorkspace?.threads.find((t) => t.id === threadId),
    [foundWorkspace, threadId]
  )

  useEffect(() => {
    setActiveThreadId(threadId)
    return () => {
      setActiveThreadId(null)
    }
  }, [threadId, setActiveThreadId])

  const currentPathRef = useRef<string | null>(null)
  useEffect(() => {
    const newPath = foundWorkspace?.path ?? null
    if (newPath !== currentPathRef.current) {
      currentPathRef.current = newPath
      setCurrentWorkspace(newPath ?? "")
    }
    // Do not reset currentPathRef on cleanup — the same component instance is reused
    // when switching threads, so resetting would cause setCurrentWorkspace to fire
    // again even when the workspace hasn't changed.
  }, [foundWorkspace?.path, setCurrentWorkspace])

  useEffect(() => {
    updateSetting({
      key: APP_SETTINGS_KEYS.ACTIVE_THREAD_ID,
      value: threadId,
    })
    updateLastAccessed(threadId)
  }, [threadId, updateSetting, updateLastAccessed])

  useEffect(() => {
    if (!isLoading && !isFetching && !foundThread) {
      navigate({ to: "/" })
    }
  }, [isLoading, isFetching, foundThread, navigate])

  if (!foundThread?.sessionId) {
    return <ChatViewSkeleton />
  }

  return (
    <ChatView
      sessionId={foundThread.sessionId}
      workspaceId={foundWorkspace!.id}
      threadId={foundThread.id}
      initialModelId={foundThread.modelId}
      initialMode={foundThread.mode ?? "code"}
      initialIsStopped={foundThread.isStopped}
    />
  )
}
