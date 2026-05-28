/**
 * Chat stream hook — connects the WebSocket stream to UI state.
 *
 * Responsibilities:
 * - Opens a WebSocket for the session and dispatches live events to callbacks
 * - Fetches a status snapshot on mount to restore transient state (isRunning,
 *   isCompacting, pendingError) without relying on WebSocket event replay
 * - Manages isLoading, isCompacting, pendingError as local state
 * - Provides startUserPrompt() which optimistically adds the user message
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"

import { useSessionStream } from "./hooks/use-session-stream"
import { useVisibleMessages } from "./hooks/use-visible-messages"
import {
  messagesQueryKey,
  useSessionStatus,
  updateLastPageMessages,
  MESSAGES_PAGE_SIZE,
  type MessagesInfiniteData,
} from "./queries"
import { dismissSessionError, listMessages } from "./api"
import { createErrorMessage, blocksToMessages } from "./types"
import type { ErrorMessage, Message, UserMessage, MessageBlock } from "./types"
import { useSetThreadStatus, useThreadStatusStore } from "./thread-status-store"
import { gitStatusKey, gitKeys } from "@/features/git/queries"

const FILE_MODIFYING_TOOLS = new Set([
  "write", "edit", "create", "delete", "replace", "move", "copy",
  "writefile", "write_file", "editfile", "edit_file", "createfile", "create_file",
  "bash", "shell",
])

function isFileModifyingTool(toolName: string): boolean {
  if (FILE_MODIFYING_TOOLS.has(toolName.toLowerCase())) return true
  const lower = toolName.toLowerCase()
  return lower.includes("write") || lower.includes("edit") ||
    lower.includes("create") || lower.includes("delete") ||
    lower.includes("mkdir") || lower.includes("move") ||
    lower.includes("copy") || lower.includes("bash") ||
    lower.includes("shell")
}

interface UseChatStreamOptions {
  sessionId: string
  threadId: string
  initialIsStopped: boolean
  onPlanSaved?: (event: { filePath: string; relativePath: string }) => void
}

interface UseChatStreamResult {
  visibleMessages: Message[]
  hasConversationHistory: boolean
  hasLoadedMessages: boolean
  isLoading: boolean
  /** True while messages are being fetched from the server (suppress empty state during initial load). */
  isLoadingMessages: boolean
  isStopped: boolean
  isCompacting: boolean
  compactionReason: "manual" | "threshold" | "overflow" | null
  pendingError: ErrorMessage | null
  startUserPrompt: (text: string, thinkingLevel?: string) => void
  markStopped: () => void
  markSendFailed: () => void
  dismissError: (id: string) => void
  fetchPreviousPage: () => void
  hasPreviousPage: boolean
  isFetchingPreviousPage: boolean
}

export function useChatStream({
  sessionId,
  threadId,
  initialIsStopped,
  onPlanSaved,
}: UseChatStreamOptions): UseChatStreamResult {
  const setThreadStatus = useSetThreadStatus()
  const queryClient = useQueryClient()
  const [isStopped, setIsStopped] = useState(initialIsStopped)
  const [isCompacting, setIsCompacting] = useState(false)
  const [compactionReason, setCompactionReason] = useState<"manual" | "threshold" | "overflow" | null>(null)
  const [pendingError, setPendingError] = useState<ReturnType<typeof createErrorMessage> | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Reset state synchronously during render when the session changes.
  const [localSessionId, setLocalSessionId] = useState(sessionId)
  if (localSessionId !== sessionId) {
    setLocalSessionId(sessionId)
    setIsLoading(false)
    setIsStopped(initialIsStopped)
    setIsCompacting(false)
    setCompactionReason(null)
    setPendingError(null)
  }

  // Fetch the status snapshot from the server on every thread mount/switch.
  // This replaces event-replay as the mechanism for restoring transient UI state
  // (isRunning, isCompacting, pendingError) without side-effect re-fires.
  const { data: sessionStatus } = useSessionStatus(sessionId)

  useEffect(() => {
    if (!sessionStatus) return
    setIsLoading(sessionStatus.isRunning)
    setIsCompacting(sessionStatus.isCompacting)
    setCompactionReason(sessionStatus.compactionReason)
    if (sessionStatus.pendingError) {
      const { title, message, retryable, retryCount } = sessionStatus.pendingError
      setPendingError(createErrorMessage(title, message, { retryable, retryCount, action: { type: "dismiss" } }))
      setThreadStatus(threadId, "error")
    }

    // If the agent finished while we were viewing another thread, the per-session
    // WebSocket was closed and never delivered the agent_end event, so the messages
    // cache may be missing the DB-persisted turn. Force a refresh whenever we mount
    // onto a session that (a) is not running now and (b) was marked "completed" by
    // the global WebSocket while we were away — exactly the condition where events
    // were missed.
    if (!sessionStatus.isRunning) {
      const storedStatus = useThreadStatusStore.getState().statuses[threadId]
      if (storedStatus === "completed") {
        void queryClient.invalidateQueries({ queryKey: messagesQueryKey(sessionId) })
      }
    }
  }, [sessionStatus, setThreadStatus, threadId, queryClient, sessionId])

  const {
    messages,
    isLoading: isLoadingMessages,
    fetchPreviousPage,
    hasPreviousPage,
    isFetchingPreviousPage,
  } = useVisibleMessages({ sessionId })

  const handleIsLoadingChange = useCallback((loading: boolean) => {
    setIsLoading(loading)
  }, [])

  // All errors reaching this callback are from live events (no replay); mark
  // the thread as error unconditionally.
  const handleError = useCallback(() => {
    setThreadStatus(threadId, "error")
  }, [setThreadStatus, threadId])

  const handleToolExecutionEnd = useCallback((toolName: string) => {
    // Skip per-file diffs (key[3] === "diff") — N active observers all refetching
    // on every tool execution end creates a request burst. Diffs are lazily
    // refreshed when the user expands a file or the statusCode changes.
    void queryClient.invalidateQueries({
      queryKey: gitKeys.session(sessionId),
      predicate: (query) => (query.queryKey as unknown[])[3] !== "diff",
    })
    void queryClient.invalidateQueries({ queryKey: ["file-tree"] })
    if (isFileModifyingTool(toolName)) {
      void queryClient.refetchQueries({ queryKey: gitStatusKey(sessionId) })
      void queryClient.refetchQueries({ queryKey: ["file-tree"] })
    }
  }, [queryClient, sessionId])

  // Connect to WebSocket stream
  const { lastPromptRef, pendingThinkingLevelRef } = useSessionStream({
    sessionId,
    onIsLoadingChange: handleIsLoadingChange,
    onIsCompactingChange: setIsCompacting,
    onCompactionReasonChange: setCompactionReason,
    onPendingErrorChange: setPendingError,
    onError: handleError,
    onToolExecutionEnd: handleToolExecutionEnd,
    onPlanSaved,
  })

  // After the agent finishes, replace optimistic user-message placeholders (no
  // DB id) with server-persisted versions so fork/revert blockIds appear.
  // The 750 ms delay lets the server finish its async DB write before we fetch.
  //
  // We use setQueryData (patching only the last page) instead of invalidateQueries
  // (which refetches all pages) so that older pages the user has already scrolled
  // back to load are not dropped from the cache.
  const prevIsLoadingRef = useRef(isLoading)
  useEffect(() => {
    const wasLoading = prevIsLoadingRef.current
    prevIsLoadingRef.current = isLoading
    if (!wasLoading || isLoading) return
    const timer = setTimeout(() => {
      listMessages(sessionId, { limit: MESSAGES_PAGE_SIZE })
        .then(({ blocks }) => {
          const serverMessages = blocksToMessages(blocks as MessageBlock[])
          // Build a content-keyed map of server user messages that now have DB ids.
          const serverUserByContent = new Map<string, UserMessage>()
          for (const m of serverMessages) {
            if (m.role === "user" && (m as UserMessage).id) {
              serverUserByContent.set((m as UserMessage).content, m as UserMessage)
            }
          }
          if (serverUserByContent.size === 0) return

          // Patch only the last (most-recent) page — older pages stay intact.
          queryClient.setQueryData<MessagesInfiniteData>(
            messagesQueryKey(sessionId),
            (prev) =>
              updateLastPageMessages(prev, (msgs) =>
                msgs.map((msg): Message => {
                  if (msg.role !== "user" || (msg as UserMessage).id) return msg
                  const persisted = serverUserByContent.get((msg as UserMessage).content)
                  return persisted ?? msg
                })
              )
          )
        })
        .catch(() => {
          // Fall back to a full invalidation if the fetch fails.
          void queryClient.invalidateQueries({ queryKey: messagesQueryKey(sessionId) })
        })
    }, 750)
    return () => clearTimeout(timer)
  }, [isLoading, queryClient, sessionId])

  const hasLoadedMessages = messages.length > 0 || isLoading

  const startUserPrompt = useCallback(
    (text: string, thinkingLevel?: string) => {
      setIsStopped(false)
      setIsLoading(true)
      lastPromptRef.current = { text, thinkingLevel }
      pendingThinkingLevelRef.current = thinkingLevel ?? null

      const userMessage: Message = { role: "user", content: text }
      queryClient.setQueryData<MessagesInfiniteData>(messagesQueryKey(sessionId), (prev) =>
        updateLastPageMessages(prev, (current) => {
          const lastMsg = current[current.length - 1]
          if (
            current.length > 0 &&
            lastMsg.role === "user" &&
            (lastMsg as Message & { content?: string }).content === text
          ) {
            return current
          }
          return [...current, userMessage]
        })
      )
    },
    [queryClient, sessionId, lastPromptRef, pendingThinkingLevelRef]
  )

  const markStopped = useCallback(() => setIsStopped(true), [])

  const markSendFailed = useCallback(() => {
    setIsLoading(false)
    setPendingError(
      createErrorMessage("Send failed", "Failed to send message. Please try again.", {
        retryable: true,
        action: lastPromptRef.current
          ? {
              type: "retry",
              prompt: lastPromptRef.current.text,
              thinkingLevel: lastPromptRef.current.thinkingLevel,
            }
          : { type: "dismiss" },
      })
    )
  }, [lastPromptRef])

  const dismissError = useCallback(
    (id: string) => {
      queryClient.setQueryData<MessagesInfiniteData>(messagesQueryKey(sessionId), (prev) =>
        updateLastPageMessages(prev, (msgs) =>
          msgs.filter((m): boolean => !(m.role === "error" && (m as ErrorMessage).id === id))
        )
      )
      setPendingError((prev) => (prev?.id === id ? null : prev))
      dismissSessionError(sessionId).catch(() => { /* best-effort */ })
    },
    [queryClient, sessionId]
  )

  return {
    visibleMessages: messages,
    hasConversationHistory: messages.length > 0,
    hasLoadedMessages,
    isLoading,
    isLoadingMessages,
    isStopped,
    isCompacting,
    compactionReason,
    pendingError,
    startUserPrompt,
    markStopped,
    markSendFailed,
    dismissError,
    fetchPreviousPage,
    hasPreviousPage,
    isFetchingPreviousPage,
  }
}
