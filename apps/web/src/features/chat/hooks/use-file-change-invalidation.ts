import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { openSessionWebSocket } from "../api"
import { subscribeToSessionEvents } from "../session-events"
import { gitStatusKey, gitKeys } from "@/features/git/queries"

// Tools that modify files and should trigger a refresh
const FILE_MODIFYING_TOOLS = new Set([
  "write",
  "edit",
  "create",
  "delete",
  "replace",
  "move",
  "copy",
  // Common naming variations
  "writefile",
  "write_file",
  "editfile",
  "edit_file",
  "createfile",
  "create_file",
  "read",
  // Also watch bash as it can run git, mkdir, rm, etc.
  "bash",
  "shell",
  "run",
])

function isFileModifyingTool(toolName: string): boolean {
  if (FILE_MODIFYING_TOOLS.has(toolName)) return true
  // Partial match for multi-step operations
  const lower = toolName.toLowerCase()
  return lower.includes("write") || lower.includes("edit") ||
    lower.includes("create") || lower.includes("delete") ||
    lower.includes("mkdir") || lower.includes("move") ||
    lower.includes("copy") || lower.includes("bash") ||
    lower.includes("shell") || lower.includes("run")
}

/**
 * Watches a session for file-modifying tool completions and
 * invalidates git status + file tree caches so the UI reflects
 * changes instantly.
 *
 * Call this once per session in the workspace/thread view.
 */
export function useFileChangeInvalidation(sessionId: string | null) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!sessionId) return

    let active = true
    let ws: WebSocket | null = null
    let unsubscribe: (() => void) | undefined

    openSessionWebSocket(sessionId)
      .then((socket) => {
        // socket is null if all retries failed
        if (!socket || !active) {
          if (socket) socket.close()
          return
        }
        ws = socket

        unsubscribe = subscribeToSessionEvents(socket, {
          onToolExecutionEnd: (data) => {
            const toolName = data.toolName
            if (!toolName) return

            console.debug(
              "[useFileChangeInvalidation] Tool ended:",
              toolName,
              data.toolCallId
            )

            // Always refresh git status after any tool ends
            // since bash commands may modify files too
            queryClient.invalidateQueries({
              queryKey: gitKeys.session(sessionId),
            })

            // Refresh file tree directory queries
            queryClient.invalidateQueries({
              queryKey: ["file-tree"],
            })

            // For file-modifying tools, also refetch immediately
            if (isFileModifyingTool(toolName)) {
              console.debug(
                "[useFileChangeInvalidation] File-modifying tool detected:",
                toolName
              )

              // Force refetch git status immediately
              void queryClient.refetchQueries({
                queryKey: gitStatusKey(sessionId),
              })

              // Force refetch all directory queries
              void queryClient.refetchQueries({
                queryKey: ["file-tree"],
              })
            }
          },

          // Also trigger on agent end to catch any missed updates
          onAgentEnd: () => {
            // Final sync — make sure everything is fresh
            void queryClient.invalidateQueries({
              queryKey: gitKeys.session(sessionId),
            })
            void queryClient.invalidateQueries({
              queryKey: ["file-tree"],
            })
          },

          // Required stub handlers — do nothing
          onMessageStart: () => {},
          onMessageUpdate: () => {},
          onMessageEnd: () => {},
          onToolExecutionStart: () => {},
          onToolExecutionUpdate: () => {},
          onTurnStart: () => {},
          onTurnEnd: () => {},
          onAgentStart: () => {},
          onQueueUpdate: () => {},
          onAutoRetryStart: () => {},
          onAutoRetryEnd: () => {},
          onCompactionStart: () => {},
          onCompactionEnd: () => {},
          onServerError: () => {},
        })
      })
      .catch(() => {
        // Silently handle - server may not be available
      })

    return () => {
      active = false
      unsubscribe?.()
      ws?.close()
    }
  }, [sessionId, queryClient])
}