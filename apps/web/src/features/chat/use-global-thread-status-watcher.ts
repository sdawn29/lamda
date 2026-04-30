import { useEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { openGlobalWebSocket } from "./api"
import { useSetThreadStatus } from "./thread-status-context"
import { workspaceKeys } from "@/features/workspace/queries"

export function useGlobalThreadStatusWatcher(activeThreadId?: string) {
  const setStatus = useSetThreadStatus()
  const queryClient = useQueryClient()
  const activeThreadIdRef = useRef(activeThreadId)
  // eslint-disable-next-line react-hooks/refs -- intentional: effect uses ref to track latest value
  activeThreadIdRef.current = activeThreadId

  useEffect(() => {
    let active = true
    let ws: WebSocket | null = null

    openGlobalWebSocket()
      .then((socket) => {
        // socket is null if all retries failed
        if (!socket || !active) {
          if (socket) socket.close()
          return
        }
        ws = socket

        ws.addEventListener("message", (e: MessageEvent) => {
          if (!active) return
          try {
            const data = JSON.parse(e.data as string) as { type: string } & Record<string, unknown>

            if (data.type === "thread_status") {
              const { threadId, status } = data as unknown as { threadId: string; status: "running" | "idle" }
              if (status === "idle" && threadId !== activeThreadIdRef.current) {
                setStatus(threadId, "completed")
              } else {
                setStatus(threadId, status)
              }
            } else if (data.type === "workspace_files_updated") {
              const { workspaceId } = data as unknown as { workspaceId: string }
              queryClient.invalidateQueries({ queryKey: workspaceKeys.files(workspaceId) })
            }
          } catch (error) {
            console.error("[thread-status]", error)
          }
        })

        ws.addEventListener("error", () => {})
      })
      .catch((error) => {
        if (active) {
          console.debug("[thread-status] WebSocket unavailable:", error)
        }
      })

    return () => {
      active = false
      ws?.close()
    }
  }, [setStatus, queryClient])
}
