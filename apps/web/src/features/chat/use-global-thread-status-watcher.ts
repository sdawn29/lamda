import { useEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { openGlobalEventSource } from "./api"
import { useSetThreadStatus } from "./thread-status-context"
import { workspaceKeys } from "@/features/workspace/queries"

export function useGlobalThreadStatusWatcher(activeThreadId?: string) {
  const setStatus = useSetThreadStatus()
  const queryClient = useQueryClient()
  const activeThreadIdRef = useRef(activeThreadId)
  activeThreadIdRef.current = activeThreadId

  useEffect(() => {
    let active = true
    let es: EventSource | null = null

    openGlobalEventSource().then((eventSource) => {
      if (!active) {
        eventSource.close()
        return
      }
      es = eventSource

      es.addEventListener("thread_status", (e: MessageEvent) => {
        if (!active) return
        try {
          const { threadId, status } = JSON.parse(e.data) as {
            threadId: string
            status: "running" | "idle"
          }
          if (status === "idle" && threadId !== activeThreadIdRef.current) {
            setStatus(threadId, "completed")
          } else {
            setStatus(threadId, status)
          }
        } catch (error) {
          console.error("[thread-status]", error)
        }
      })

      es.addEventListener("workspace_files_updated", (e: MessageEvent) => {
        if (!active) return
        try {
          const { workspaceId } = JSON.parse(e.data) as { workspaceId: string }
          queryClient.invalidateQueries({ queryKey: workspaceKeys.files(workspaceId) })
        } catch (error) {
          console.error("[workspace-index]", error)
        }
      })
    })

    return () => {
      active = false
      es?.close()
    }
  }, [setStatus, queryClient])
}
