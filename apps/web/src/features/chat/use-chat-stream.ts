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
import { getChatSyncEngine } from "./hooks/use-chat-sync-engine"
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
import { hasPendingPrompt, clearPendingPrompt } from "./pending-prompts"
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
  /** Thinking level for a prompt already sent from the new-thread view (never flowed through startUserPrompt). */
  initialPendingThinkingLevel?: string
  onPlanSaved?: (event: { filePath: string; relativePath: string }) => void
  onToolApprovalRequest?: (event: { toolCallId: string; toolName: string; input: Record<string, unknown>; scopeLabel: string }) => void
  onToolApprovalResolved?: (event: { toolCallId: string; decision: "once" | "always" | "never" | "reject" }) => void
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
  /** Number of steering/follow-up messages queued for the running agent but not yet delivered. */
  queuedCount: number
  startUserPrompt: (
    text: string,
    thinkingLevel?: string,
    attachments?: UserMessage["attachments"]
  ) => void
  /** Optimistically append a steering message to the transcript while the agent is running. */
  steerPrompt: (text: string) => void
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
  initialPendingThinkingLevel,
  onPlanSaved,
  onToolApprovalRequest,
  onToolApprovalResolved,
}: UseChatStreamOptions): UseChatStreamResult {
  const setThreadStatus = useSetThreadStatus()
  const queryClient = useQueryClient()
  const [isStopped, setIsStopped] = useState(initialIsStopped)
  const [isCompacting, setIsCompacting] = useState(false)
  const [compactionReason, setCompactionReason] = useState<"manual" | "threshold" | "overflow" | null>(null)
  const [pendingError, setPendingError] = useState<ReturnType<typeof createErrorMessage> | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [queuedCount, setQueuedCount] = useState(0)

  // A just-created thread navigates here with its prompt already in flight. Seed
  // the working state from the pending-prompt hint so the thread view shows it
  // immediately, instead of waiting for the stream's first agent_start event
  // (which lags on slow model starts). Kept separate from isLoading so the
  // server-status sync can stay a pure mirror; cleared once the stream speaks or
  // a safety timeout elapses. The UI treats `isLoading || optimisticRunning` as
  // "working".
  const [optimisticRunning, setOptimisticRunning] = useState(() =>
    hasPendingPrompt(sessionId)
  )

  // Reset state synchronously during render when the session changes.
  const [localSessionId, setLocalSessionId] = useState(sessionId)
  if (localSessionId !== sessionId) {
    setLocalSessionId(sessionId)
    setIsLoading(false)
    setOptimisticRunning(hasPendingPrompt(sessionId))
    setIsStopped(initialIsStopped)
    setIsCompacting(false)
    setCompactionReason(null)
    setPendingError(null)
    setQueuedCount(0)
  }

  // Fetch the status snapshot from the server on every thread mount/switch.
  // This replaces event-replay as the mechanism for restoring transient UI state
  // (isRunning, isCompacting, pendingError) without side-effect re-fires.
  const { data: sessionStatus } = useSessionStatus(sessionId)

  // Guards the one-time cache resync below to the *first* status snapshot after
  // this hook mounts. Deliberately NOT reset on session change (warm thread
  // switches keep the same instance) so rapid switching still serves messages
  // instantly from cache — only a genuine remount (e.g. returning from the
  // settings route, which unmounts the whole chat view) triggers a resync.
  const didMountResyncRef = useRef(false)

  // Rebuild the messages cache from a fresh server snapshot, mirroring what a
  // hard refresh does (a single, correctly-paginated first page) rather than
  // refetching whatever — possibly malformed — page structure is currently
  // cached. A plain `invalidateQueries` refetches the existing pages in place,
  // so if the cache was left with broken pagination (e.g. a seed/stream write
  // dropped `hasMore`/`oldestBlockIndex`, stranding older messages with
  // `hasPreviousPage === false`), it can't recover — which is exactly the
  // "messages missing, scrolling doesn't help, only refresh fixes it" symptom
  // seen when returning from the settings route.
  const resyncMessages = useCallback(() => {
    void (async () => {
      try {
        const { blocks, hasMore } = await listMessages(sessionId, {
          limit: MESSAGES_PAGE_SIZE,
        })
        const serverMessages = blocksToMessages(blocks as MessageBlock[])
        const oldestBlockIndex =
          blocks.length > 0 ? (blocks[0] as MessageBlock).blockIndex : null
        // Don't clobber a cache that's ahead of the server: the WS stream may
        // have written a just-finished turn before the server's async DB write
        // lands (see the agent_end handler), and the user may have paged older
        // history into the cache. Only rebuild when the server snapshot is at
        // least as complete as what we already hold.
        const existing = queryClient.getQueryData<MessagesInfiniteData>(
          messagesQueryKey(sessionId)
        )
        const existingCount = (existing?.pages ?? []).reduce(
          (n, p) => n + p.messages.length,
          0
        )
        if (existingCount > serverMessages.length) return
        queryClient.setQueryData<MessagesInfiniteData>(
          messagesQueryKey(sessionId),
          {
            pages: [{ messages: serverMessages, hasMore, oldestBlockIndex }],
            pageParams: [undefined],
          }
        )
        getChatSyncEngine().saveMessages(sessionId, serverMessages, {
          hasMore,
          oldestBlockIndex,
        })
      } catch {
        // Best-effort fallback — a plain invalidation still nudges a refetch.
        void queryClient.invalidateQueries({
          queryKey: messagesQueryKey(sessionId),
        })
      }
    })()
  }, [queryClient, sessionId])

  // Consume the one-shot optimistic hint for this session and bound it with a
  // safety timeout, so a prompt that never reaches the agent (e.g. send failure)
  // can't leave the working indicator stuck on screen forever. The stream
  // normally clears it well before this fires (see handleIsLoadingChange).
  useEffect(() => {
    const pending = hasPendingPrompt(sessionId)
    clearPendingPrompt(sessionId)
    if (!pending) return
    const timer = setTimeout(() => setOptimisticRunning(false), 30_000)
    return () => clearTimeout(timer)
  }, [sessionId])

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

    // On the first status snapshot after a (re)mount, resync the messages cache
    // if the session is idle. Returning from a route that unmounts the chat view
    // (e.g. settings) tears down the per-session WebSocket, so any turn that
    // completed in the meantime never reached the cache — and the query's
    // staleTime can suppress the mount refetch, leaving a stale transcript.
    // Gated on `isRunning === false`: a running session is served live by the
    // reconnected stream, and refetching would race the server's DB write.
    // Skipped on warm thread switches (ref stays set) to preserve instant,
    // cache-served switching.
    if (!didMountResyncRef.current) {
      didMountResyncRef.current = true
      if (!sessionStatus.isRunning) {
        resyncMessages()
      }
      return
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
        resyncMessages()
      }
    }
  }, [sessionStatus, setThreadStatus, threadId, queryClient, sessionId, resyncMessages])

  const {
    messages,
    isLoading: isLoadingMessages,
    fetchPreviousPage,
    hasPreviousPage,
    isFetchingPreviousPage,
  } = useVisibleMessages({ sessionId })

  const handleIsLoadingChange = useCallback((loading: boolean) => {
    // The stream is the source of truth — once it speaks, the optimistic hint
    // has served its purpose.
    setOptimisticRunning(false)
    setIsLoading(loading)
    // The queue only exists for the duration of a run; clear it the moment the
    // agent goes idle so a stale "queued" indicator never lingers.
    if (!loading) setQueuedCount(0)
  }, [])

  const handleQueueUpdate = useCallback((event: { steering: number; followUp: number }) => {
    setQueuedCount(event.steering + event.followUp)
  }, [])

  // All errors reaching this callback are from live events (no replay); mark
  // the thread as error unconditionally.
  const handleError = useCallback(() => {
    setThreadStatus(threadId, "error")
  }, [setThreadStatus, threadId])

  const handleToolExecutionEnd = useCallback((toolName: string) => {
    const modifiesFiles = isFileModifyingTool(toolName)
    // Skip per-file diffs (key[3] === "diff") — N active observers all refetching
    // on every tool execution end creates a request burst. Diffs are lazily
    // refreshed when the user expands a file or the statusCode changes.
    // Also skip git status when it's force-refetched below — invalidating it
    // here too would cancel that in-flight request and fetch twice.
    void queryClient.invalidateQueries({
      queryKey: gitKeys.session(sessionId),
      predicate: (query) => {
        const part = (query.queryKey as unknown[])[3]
        if (part === "diff") return false
        if (modifiesFiles && part === "status") return false
        return true
      },
    })
    if (modifiesFiles) {
      void queryClient.refetchQueries({ queryKey: gitStatusKey(sessionId) })
      void queryClient.refetchQueries({ queryKey: ["file-tree"] })
    } else {
      void queryClient.invalidateQueries({ queryKey: ["file-tree"] })
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
    onQueueUpdate: handleQueueUpdate,
    onToolApprovalRequest,
    onToolApprovalResolved,
  })

  // When a new thread is created from new-thread-view, the prompt is sent
  // directly to the server (not through startUserPrompt), so pendingThinkingLevelRef
  // is never seeded. Seed it here so onMessageStart picks up the correct level.
  if (optimisticRunning && initialPendingThinkingLevel != null && pendingThinkingLevelRef.current === null) {
    pendingThinkingLevelRef.current = initialPendingThinkingLevel
  }

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

  // What the UI should treat as "the agent is working" — the real stream state
  // OR the optimistic pre-stream window for a freshly-sent thread.
  const isWorking = isLoading || optimisticRunning

  const hasLoadedMessages = messages.length > 0 || isWorking

  // Append a user message to the transcript immediately, deduping against an
  // identical trailing user row (guards against double-fires from retry paths).
  const appendOptimisticUserMessage = useCallback(
    (text: string, attachments?: UserMessage["attachments"]) => {
      const userMessage: Message = { role: "user", content: text, attachments }
      queryClient.setQueryData<MessagesInfiniteData>(messagesQueryKey(sessionId), (prev) =>
        updateLastPageMessages(prev, (current) => {
          const lastMsg = current[current.length - 1]
          if (
            current.length > 0 &&
            lastMsg.role === "user" &&
            (lastMsg as Message & { content?: string }).content === text &&
            !attachments
          ) {
            return current
          }
          return [...current, userMessage]
        })
      )
    },
    [queryClient, sessionId]
  )

  const startUserPrompt = useCallback(
    (text: string, thinkingLevel?: string, attachments?: UserMessage["attachments"]) => {
      setIsStopped(false)
      setIsLoading(true)
      lastPromptRef.current = { text, thinkingLevel }
      pendingThinkingLevelRef.current = thinkingLevel ?? null
      appendOptimisticUserMessage(text, attachments)
    },
    [appendOptimisticUserMessage, lastPromptRef, pendingThinkingLevelRef]
  )

  // Steering: the agent is already running, so we only append the user's message
  // to the transcript. isLoading/lastPrompt stay untouched — the in-flight run
  // owns those, and the SDK delivers this message into the current turn. The
  // "queued" count is driven by queue_update events from the server.
  const steerPrompt = useCallback(
    (text: string) => {
      setQueuedCount((n) => n + 1)
      appendOptimisticUserMessage(text)
    },
    [appendOptimisticUserMessage]
  )

  // Called when the server confirms an abort. Clear isLoading immediately
  // instead of waiting for the agent_end WebSocket event — that event may never
  // arrive (connection dropped, agent already idle, or event missed), which
  // would otherwise leave the Stop button stuck on screen indefinitely. If
  // agent_end does arrive later it's idempotent (sets isLoading false again).
  const markStopped = useCallback(() => {
    setIsStopped(true)
    setIsLoading(false)
  }, [])

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
    isLoading: isWorking,
    isLoadingMessages,
    isStopped,
    isCompacting,
    compactionReason,
    pendingError,
    queuedCount,
    startUserPrompt,
    steerPrompt,
    markStopped,
    markSendFailed,
    dismissError,
    fetchPreviousPage,
    hasPreviousPage,
    isFetchingPreviousPage,
  }
}
