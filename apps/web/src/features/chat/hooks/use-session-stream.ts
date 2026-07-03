import { useEffect, useRef, useCallback } from "react"
import { flushSync } from "react-dom"
import { useQueryClient } from "@tanstack/react-query"

import {
  openSessionWebSocket,
  listRunningTools,
  fetchSessionStatus,
} from "../api"
import {
  subscribeToSessionEvents,
  type AgentEndMessage,
} from "../session-events"
import {
  messagesQueryKey,
  chatKeys,
  updateLastPageMessages,
  type MessagesInfiniteData,
} from "../queries"
import { createErrorMessage, blockToMessage } from "../types"
import type { ToolMessage } from "../types"
import { gitKeys } from "@/features/git/queries"
import { workspaceKeys } from "@/features/workspace/queries"
import {
  applyQueuedEvent,
  type QueuedEvent,
  type TurnMeta,
} from "../lib/stream-reducer"

// ── Per-session stream state ──────────────────────────────────────────────────

type DoneFlag = { current: boolean }
const sessionDoneFlags = new Map<string, DoneFlag>()

function getSessionDoneFlag(sessionId: string): DoneFlag {
  const existing = sessionDoneFlags.get(sessionId)
  if (existing) return existing
  const flag: DoneFlag = { current: false }
  sessionDoneFlags.set(sessionId, flag)
  return flag
}

// Last server event id seen per session, preserved across hook re-mounts (thread
// switches / page navigations). The per-hook lastEventIdRef resets to undefined
// when the component re-mounts, so without this a return to a running thread
// reconnects with no lastEventId — the server then replays the entire in-progress
// turn from message_start, re-appending a duplicate assistant block each time.
// Keying by sessionId lets the reconnect resume from the last seen event so only
// genuinely-missed events are replayed.
//
// Never explicitly cleared per-session (a thread can go idle and come back), so
// it's capped here — otherwise it grows by one entry per distinct session ever
// visited for the life of the window.
const sessionLastEventIds = new Map<string, string>()
const MAX_TRACKED_SESSIONS = 50

function rememberLastEventId(sessionId: string, id: string): void {
  sessionLastEventIds.set(sessionId, id)
  if (sessionLastEventIds.size <= MAX_TRACKED_SESSIONS) return
  // Map iteration order is insertion order — the first key is the oldest.
  const oldest = sessionLastEventIds.keys().next().value
  if (oldest !== undefined && oldest !== sessionId) {
    sessionLastEventIds.delete(oldest)
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface UseSessionStreamOptions {
  sessionId: string
  onMessageStart?: () => void
  onMessageEnd?: () => void
  onIsLoadingChange?: (loading: boolean) => void
  onIsCompactingChange?: (compacting: boolean) => void
  onCompactionReasonChange?: (
    reason: "manual" | "threshold" | "overflow" | null
  ) => void
  onPendingErrorChange?: (
    error: ReturnType<typeof createErrorMessage> | null
  ) => void
  onError?: () => void
  onToolExecutionEnd?: (toolName: string) => void
  onPlanSaved?: (event: { filePath: string; relativePath: string }) => void
  /** Live count of messages waiting in the steering / follow-up queues. */
  onQueueUpdate?: (event: { steering: number; followUp: number }) => void
  /** A gated tool is paused awaiting the user's approval. */
  onToolApprovalRequest?: (event: {
    toolCallId: string
    toolName: string
    input: Record<string, unknown>
    scopeLabel: string
  }) => void
  /** A pending approval was settled or cancelled. */
  onToolApprovalResolved?: (event: {
    toolCallId: string
    decision: "once" | "always" | "never" | "reject"
  }) => void
}

export function useSessionStream({
  sessionId,
  onMessageStart,
  onMessageEnd,
  onIsLoadingChange,
  onIsCompactingChange,
  onCompactionReasonChange,
  onPendingErrorChange,
  onError,
  onToolExecutionEnd,
  onPlanSaved,
  onQueueUpdate,
  onToolApprovalRequest,
  onToolApprovalResolved,
}: UseSessionStreamOptions) {
  const queryClient = useQueryClient()

  // Unified event queue — every WebSocket event lands here in arrival order.
  const eventQueueRef = useRef<QueuedEvent[]>([])
  const rafRef = useRef<number | null>(null)
  // Timeout-based flush used while the document is hidden (rAF doesn't fire
  // there, which would let events — including agent_end — queue indefinitely
  // in a backgrounded window).
  const flushTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Tool start-time tracking for accurate duration on tool_end.
  const pendingToolStartRef = useRef<Map<string, number>>(new Map())

  // Accumulated per-turn metadata (model, provider, thinkingLevel, startTime).
  // Updated synchronously on delta events; snapshotted into agent_end event.
  const turnMetaRef = useRef<TurnMeta | null>(null)

  const lastPromptRef = useRef<{ text: string; thinkingLevel?: string } | null>(
    null
  )
  const pendingThinkingLevelRef = useRef<string | null>(null)

  // True while an assistant turn is in progress (message_start → agent_end).
  // Used to suppress spurious transport errors from idle WebSocket closes that
  // happen after agent_end (e.g. server graceful shutdown between turns).
  const agentRunningRef = useRef(false)

  // Last event id received from the server. Used to resume the stream from the
  // correct position when reconnecting after a transient network drop.
  const lastEventIdRef = useRef<string | undefined>(undefined)

  // Always-current callbacks — stored in a ref so the queue processor (which
  // is stable across renders) always calls the latest versions.
  const callbacksRef = useRef({
    onMessageStart,
    onIsLoadingChange,
    onMessageEnd,
    onIsCompactingChange,
    onCompactionReasonChange,
    onPendingErrorChange,
    onError,
    onToolExecutionEnd,
    onPlanSaved,
    onQueueUpdate,
    onToolApprovalRequest,
    onToolApprovalResolved,
  })
  useEffect(() => {
    callbacksRef.current = {
      onMessageStart,
      onIsLoadingChange,
      onMessageEnd,
      onIsCompactingChange,
      onCompactionReasonChange,
      onPendingErrorChange,
      onError,
      onToolExecutionEnd,
      onPlanSaved,
      onQueueUpdate,
      onToolApprovalRequest,
      onToolApprovalResolved,
    }
  }, [
    onMessageStart,
    onIsLoadingChange,
    onMessageEnd,
    onIsCompactingChange,
    onCompactionReasonChange,
    onPendingErrorChange,
    onError,
    onToolExecutionEnd,
    onPlanSaved,
    onQueueUpdate,
    onToolApprovalRequest,
    onToolApprovalResolved,
  ])

  // ── Queue processor ───────────────────────────────────────────────────────
  //
  // Drains the entire queue in one pass:
  //   1. Apply each event as a pure transform → new messages state
  //   2. ONE setQueryData call
  //   3. Fire collected side-effects in arrival order

  const processQueue = useCallback(() => {
    rafRef.current = null
    if (flushTimeoutRef.current !== null) {
      clearTimeout(flushTimeoutRef.current)
      flushTimeoutRef.current = null
    }
    const events = eventQueueRef.current.splice(0)
    if (events.length === 0) return

    const cb = callbacksRef.current
    const sideEffects: Array<() => void> = []

    // ── 1. Pure state transitions ───────────────────────────────────────────
    queryClient.setQueryData<MessagesInfiniteData>(
      messagesQueryKey(sessionId),
      (prev) =>
        updateLastPageMessages(prev, (msgs) => {
          for (const event of events) {
            msgs = applyQueuedEvent(msgs, event)
          }
          return msgs
        })
    )

    // ── 2. Collect side-effects in event order ──────────────────────────────
    for (const event of events) {
      switch (event.kind) {
        case "agent_start":
          sideEffects.push(() => cb.onIsLoadingChange?.(true))
          break

        case "message_start":
          sideEffects.push(() => {
            cb.onMessageStart?.()
            cb.onIsLoadingChange?.(true)
          })
          break

        case "tool_end": {
          const { toolName } = event
          if (toolName) {
            sideEffects.push(() => cb.onToolExecutionEnd?.(toolName))
          }
          break
        }

        case "agent_end": {
          const hasError = event.agentMessages.some(
            (msg): boolean =>
              msg.role === "assistant" &&
              (msg as Extract<AgentEndMessage, { role: "assistant" }>)
                .stopReason === "error" &&
              !!(msg as Extract<AgentEndMessage, { role: "assistant" }>)
                .errorMessage
          )
          sideEffects.push(() => {
            cb.onMessageEnd?.()
            cb.onIsLoadingChange?.(false)
            if (hasError) cb.onError?.()
            // Don't invalidate the messages query — the WS stream just wrote
            // the canonical state into cache; refetching now races with the
            // server's async DB write and can briefly replay stale rows.
            void queryClient.invalidateQueries({
              queryKey: chatKeys.contextUsage(sessionId),
            })
            void queryClient.invalidateQueries({
              queryKey: chatKeys.sessionStats(sessionId),
            })
            void queryClient.invalidateQueries({
              queryKey: gitKeys.turns(sessionId),
            })
            // Skip per-file diffs (key[3] === "diff") — see use-chat-stream.ts comment.
            void queryClient.invalidateQueries({
              queryKey: gitKeys.session(sessionId),
              predicate: (query) => (query.queryKey as unknown[])[3] !== "diff",
            })
            void queryClient.invalidateQueries({
              queryKey: workspaceKeys.dirAll,
            })
          })
          break
        }

        case "auto_retry_start":
          sideEffects.push(() =>
            cb.onPendingErrorChange?.(
              createErrorMessage("Retrying", event.errorMessage, {
                retryable: true,
                retryCount: event.attempt,
                action: { type: "dismiss" },
              })
            )
          )
          break

        case "auto_retry_end":
          if (!event.success && event.finalError) {
            const { lastPrompt, finalError } = event
            sideEffects.push(() => {
              cb.onPendingErrorChange?.(
                createErrorMessage("Retry Failed", finalError, {
                  retryable: true,
                  action: lastPrompt
                    ? {
                        type: "retry",
                        prompt: lastPrompt.text,
                        thinkingLevel: lastPrompt.thinkingLevel,
                      }
                    : { type: "dismiss" },
                })
              )
              cb.onError?.()
            })
          } else {
            sideEffects.push(() => cb.onPendingErrorChange?.(null))
          }
          break

        case "compaction_start":
          sideEffects.push(() => {
            cb.onIsCompactingChange?.(true)
            cb.onCompactionReasonChange?.(event.reason)
          })
          break

        case "compaction_end":
          if (event.errorMessage && !event.aborted) {
            const { errorMessage } = event
            sideEffects.push(() => {
              cb.onIsCompactingChange?.(false)
              cb.onCompactionReasonChange?.(null)
              cb.onPendingErrorChange?.(
                createErrorMessage("Compaction Failed", errorMessage, {
                  action: { type: "dismiss" },
                })
              )
              cb.onError?.()
            })
          } else {
            sideEffects.push(() => {
              cb.onIsCompactingChange?.(false)
              cb.onCompactionReasonChange?.(null)
              cb.onPendingErrorChange?.(null)
              void queryClient.invalidateQueries({
                queryKey: chatKeys.contextUsage(sessionId),
              })
              void queryClient.invalidateQueries({
                queryKey: chatKeys.sessionStats(sessionId),
              })
            })
          }
          break

        case "server_error": {
          const { message, lastPrompt } = event
          sideEffects.push(() => {
            cb.onPendingErrorChange?.(
              createErrorMessage("Error", message, {
                retryable: true,
                action: lastPrompt
                  ? {
                      type: "retry",
                      prompt: lastPrompt.text,
                      thinkingLevel: lastPrompt.thinkingLevel,
                    }
                  : { type: "dismiss" },
              })
            )
            cb.onError?.()
            cb.onIsLoadingChange?.(false)
          })
          break
        }

        case "transport_error": {
          const { lastPrompt } = event
          sideEffects.push(() => {
            cb.onPendingErrorChange?.(
              createErrorMessage(
                "Connection Lost",
                "The connection to the server was lost. Please try again.",
                {
                  action: lastPrompt
                    ? {
                        type: "retry",
                        prompt: lastPrompt.text,
                        thinkingLevel: lastPrompt.thinkingLevel,
                      }
                    : { type: "dismiss" },
                }
              )
            )
            cb.onError?.()
            cb.onIsLoadingChange?.(false)
            void queryClient.invalidateQueries({
              queryKey: messagesQueryKey(sessionId),
            })
          })
          break
        }
      }
    }

    // ── 3. Fire side-effects after state is settled ─────────────────────────
    for (const effect of sideEffects) effect()
  }, [queryClient, sessionId])

  // Schedule a processQueue on the next animation frame (deduplicated).
  // Hidden documents get a timeout instead — rAF is suspended there.
  const scheduleFlush = useCallback(() => {
    if (rafRef.current !== null || flushTimeoutRef.current !== null) return
    if (document.hidden) {
      flushTimeoutRef.current = setTimeout(processQueue, 32)
    } else {
      rafRef.current = requestAnimationFrame(processQueue)
    }
  }, [processQueue])

  // Flush immediately and force a synchronous React render so that
  // tool_start/agent_end state is committed to the DOM before the next
  // WebSocket message (e.g. tool_end) is processed.  Without flushSync,
  // React 19's automatic batching can merge the running→done transition
  // into a single render, making fast tool blocks (like Write) appear to
  // skip the running state entirely.
  const flushNow = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (flushTimeoutRef.current !== null) {
      clearTimeout(flushTimeoutRef.current)
      flushTimeoutRef.current = null
    }
    flushSync(processQueue)
  }, [processQueue])

  // Enqueue an event and schedule a batched flush.
  const enqueue = useCallback(
    (event: QueuedEvent) => {
      eventQueueRef.current.push(event)
      scheduleFlush()
    },
    [scheduleFlush]
  )

  // Enqueue an event and flush synchronously (no RAF delay).
  const enqueueNow = useCallback(
    (event: QueuedEvent) => {
      eventQueueRef.current.push(event)
      flushNow()
    },
    [flushNow]
  )

  // ── Main WebSocket effect ─────────────────────────────────────────────────

  useEffect(() => {
    const doneFlag = getSessionDoneFlag(sessionId)
    doneFlag.current = false
    // Resume from the last event seen for this session (survives thread switches),
    // so a reconnect replays only missed events rather than the whole turn.
    lastEventIdRef.current = sessionLastEventIds.get(sessionId)
    let ws: WebSocket | null = null
    let unsubscribe: (() => void) | undefined
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    // Counts consecutive reconnect attempts while the agent is running.
    // Reset to 0 whenever a server event is successfully received.
    let reconnectAttempts = 0
    const MAX_RECONNECT_ATTEMPTS = 3
    // After the fast attempts are exhausted but the server still can't be
    // reached (or briefly reports idle), we keep retrying on a slower cadence
    // rather than declaring the turn dead — this is the laptop sleep/wake case,
    // where the network can take many seconds to come back. Bounded so a server
    // that is genuinely gone eventually surfaces a terminal error.
    let slowReconnectAttempts = 0
    const MAX_SLOW_RECONNECT_ATTEMPTS = 12
    const SLOW_RECONNECT_DELAY_MS = 5000

    function teardownSocket() {
      ws?.close()
      ws = null
      unsubscribe?.()
      unsubscribe = undefined
    }

    function scheduleReconnect(delay: number) {
      if (reconnectTimer !== null) return
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null
        if (!doneFlag.current)
          connect(lastEventIdRef.current).catch(console.debug)
      }, delay)
    }

    // Called when the fast reconnect attempts are exhausted while the agent was
    // running. Instead of immediately declaring the turn lost, ask the server
    // whether the agent is still working. If it is, the socket — not the turn —
    // is what broke, so we keep the working indicator and keep retrying. Only
    // after a bounded window of an unreachable/idle server do we surface a
    // terminal "Connection Lost" error. This prevents the UI from falsely
    // showing the agent as stopped (and the user re-prompting a still-running
    // agent, which the server rejects with "Agent is already processing").
    async function handleReconnectExhausted() {
      let reachable = true
      let stillActive = false
      try {
        const status = await fetchSessionStatus(sessionId)
        stillActive = status.isRunning || status.isCompacting
      } catch {
        reachable = false
      }
      if (doneFlag.current) return

      // Server confirms the agent is still working — keep the working indicator
      // and keep retrying indefinitely on a slow cadence; a reconnect resumes
      // the live stream and replays any events missed while disconnected.
      if (reachable && stillActive) {
        reconnectAttempts = 0
        slowReconnectAttempts = 0
        scheduleReconnect(SLOW_RECONNECT_DELAY_MS)
        return
      }

      // Either the server is unreachable (network still down after a wake) or it
      // is reachable but idle (the turn ended while we were disconnected, so a
      // reconnect will replay the buffered agent_end and settle state). Retry
      // slowly for a bounded window — keeping the working indicator — before
      // finally surfacing a terminal error.
      if (slowReconnectAttempts < MAX_SLOW_RECONNECT_ATTEMPTS) {
        slowReconnectAttempts++
        scheduleReconnect(SLOW_RECONNECT_DELAY_MS)
        return
      }
      agentRunningRef.current = false
      doneFlag.current = true
      enqueueNow({ kind: "transport_error", lastPrompt: lastPromptRef.current })
    }

    async function connect(lastEventId?: string) {
      const socket = await openSessionWebSocket(sessionId, lastEventId)
      if (doneFlag.current) {
        socket?.close()
        return
      }
      if (!socket) {
        // Reconnect attempt failed to open the socket at all. If the agent was
        // running, don't give up — defer to the status-aware retry so a
        // sleep/wake network lag doesn't falsely kill the live turn.
        if (agentRunningRef.current) {
          void handleReconnectExhausted()
        } else {
          doneFlag.current = true
          callbacksRef.current.onIsLoadingChange?.(false)
        }
        return
      }

      ws = socket

      unsubscribe = subscribeToSessionEvents(ws, {
        onAgentStart: () => {
          if (doneFlag.current) return
          // Invalidate turns so the new in-progress turn shows up immediately
          void queryClient.invalidateQueries({
            queryKey: gitKeys.turns(sessionId),
          })
          void (async () => {
            try {
              const { runningTools: blocks } = await listRunningTools(sessionId)
              if (blocks.length === 0 || doneFlag.current) return
              const tools = blocks
                .map(blockToMessage)
                .filter(
                  (msg): msg is ToolMessage =>
                    msg.role === "tool" && msg.status === "running"
                )
              if (tools.length > 0 && !doneFlag.current) {
                enqueue({ kind: "agent_start", runningTools: tools })
              }
            } catch (e) {
              console.warn("[session-stream] Failed to fetch running tools:", e)
            }
          })()
        },

        onMessageStart: (data) => {
          if (doneFlag.current) return
          if (data.message?.role !== "assistant") return
          agentRunningRef.current = true
          // Preserve thinkingLevel across multiple message_starts within one agent turn.
          // pendingThinkingLevelRef is only populated for the first LLM call; subsequent
          // calls (after tool results) must inherit the level set by the user.
          const inheritedThinkingLevel = turnMetaRef.current?.thinkingLevel
          turnMetaRef.current = {
            startTime: Date.now(),
            thinkingLevel:
              inheritedThinkingLevel ??
              pendingThinkingLevelRef.current ??
              undefined,
          }
          pendingThinkingLevelRef.current = null
          enqueue({ kind: "message_start" })
        },

        onMessageUpdate: (data) => {
          if (doneFlag.current) return
          const event = data.assistantMessageEvent
          if (
            event == null ||
            typeof event.delta !== "string" ||
            (event.type !== "text_delta" && event.type !== "thinking_delta")
          )
            return

          // Accumulate model/provider into turn meta (side-effect outside queue — only
          // affects the agent_end snapshot, not rendered messages state).
          if (turnMetaRef.current) {
            if (!turnMetaRef.current.model && event.partial?.model)
              turnMetaRef.current.model = event.partial.model
            if (!turnMetaRef.current.provider && event.partial?.provider)
              turnMetaRef.current.provider = event.partial.provider
          }

          enqueue(
            event.type === "thinking_delta"
              ? { kind: "thinking_delta", delta: event.delta }
              : { kind: "text_delta", delta: event.delta }
          )
        },

        onToolExecutionStart: (data) => {
          if (doneFlag.current) return
          const startTime = Date.now()
          pendingToolStartRef.current.set(data.toolCallId, startTime)
          enqueueNow({
            kind: "tool_start",
            toolCallId: data.toolCallId,
            toolName: data.toolName,
            args: data.args,
            startTime,
          })
        },

        onToolExecutionUpdate: (data) => {
          if (doneFlag.current) return
          enqueue({
            kind: "tool_update",
            toolCallId: data.toolCallId,
            toolName: data.toolName,
            args: data.args,
            partialResult: data.partialResult,
          })
        },

        onToolExecutionEnd: (data) => {
          if (doneFlag.current) return
          const startTime = pendingToolStartRef.current.get(data.toolCallId)
          pendingToolStartRef.current.delete(data.toolCallId)
          enqueue({
            kind: "tool_end",
            toolCallId: data.toolCallId,
            toolName: data.toolName,
            status: data.isError ? "error" : "done",
            result: data.result,
            duration: startTime ? Date.now() - startTime : undefined,
          })
        },

        onAgentEnd: (data) => {
          if (doneFlag.current) return
          agentRunningRef.current = false
          // Snapshot and clear turn meta before flushing so the agent_end
          // event carries the final accumulated model/provider/timing.
          const meta = turnMetaRef.current
          turnMetaRef.current = null
          // Use RAF-batched enqueue (not flushSync) — agent_end has no
          // downstream race; the next startUserPrompt runs through the
          // same queue, so ordering is preserved without forcing a
          // synchronous commit that would block the main thread right
          // when the assistant text is finishing its reveal.
          enqueue({
            kind: "agent_end",
            agentMessages: data.messages ?? [],
            meta,
          })
        },

        onTurnFileChanged: () => {
          if (doneFlag.current) return
          // Skip if a fetch is already in-flight — the response will reflect the latest state.
          if (
            queryClient.getQueryState(gitKeys.turns(sessionId))?.fetchStatus ===
            "fetching"
          )
            return
          void queryClient.invalidateQueries({
            queryKey: gitKeys.turns(sessionId),
          })
          void queryClient.invalidateQueries({
            queryKey: gitKeys.status(sessionId),
          })
          void queryClient.invalidateQueries({
            queryKey: gitKeys.diffStat(sessionId),
          })
        },

        onPlanSaved: (data) => {
          if (doneFlag.current) return
          callbacksRef.current.onPlanSaved?.(data)
        },

        onMessageEnd: () => {},
        onTurnStart: () => {},
        onTurnEnd: () => {},
        onQueueUpdate: (data) => {
          if (doneFlag.current) return
          callbacksRef.current.onQueueUpdate?.({
            steering: data.steering.length,
            followUp: data.followUp.length,
          })
        },

        onToolApprovalRequest: (data) => {
          if (doneFlag.current) return
          callbacksRef.current.onToolApprovalRequest?.(data)
        },

        onToolApprovalResolved: (data) => {
          if (doneFlag.current) return
          callbacksRef.current.onToolApprovalResolved?.(data)
        },

        onAutoRetryStart: ({ attempt, errorMessage }) => {
          if (doneFlag.current) return
          enqueue({ kind: "auto_retry_start", attempt, errorMessage })
        },

        onAutoRetryEnd: ({ success, finalError }) => {
          if (doneFlag.current) return
          enqueue({
            kind: "auto_retry_end",
            success,
            finalError,
            lastPrompt: lastPromptRef.current,
          })
        },

        onCompactionStart: ({ reason }) => {
          if (doneFlag.current) return
          enqueue({ kind: "compaction_start", reason })
        },

        onCompactionEnd: ({ reason, errorMessage, aborted, willRetry }) => {
          if (doneFlag.current) return
          enqueue({
            kind: "compaction_end",
            reason,
            errorMessage,
            aborted,
            willRetry,
          })
        },

        onServerError: ({ message }) => {
          if (doneFlag.current) return
          doneFlag.current = true
          enqueueNow({
            kind: "server_error",
            message,
            lastPrompt: lastPromptRef.current,
          })
        },

        onEventId: (id: string) => {
          lastEventIdRef.current = id
          // Persist across hook re-mounts so returning to a running thread
          // resumes the stream instead of replaying the whole turn.
          rememberLastEventId(sessionId, id)
          // Reset the counters whenever a server event is received — consecutive
          // failures is what we care about, not lifetime reconnects.
          reconnectAttempts = 0
          slowReconnectAttempts = 0
        },

        onTransportError: () => {
          if (doneFlag.current) return
          if (!agentRunningRef.current) {
            // Connection dropped while idle (e.g. laptop sleep/wake).
            // Silently reconnect without surfacing an error to the user.
            teardownSocket()
            scheduleReconnect(2000)
            return
          }
          // Agent is running — attempt transparent reconnect using lastEventId
          // so the stream resumes from where it dropped. After the fast
          // attempts are exhausted, defer to the status-aware retry instead of
          // immediately declaring the turn lost (see handleReconnectExhausted).
          teardownSocket()
          if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            void handleReconnectExhausted()
            return
          }
          const delay = Math.min(500 * Math.pow(2, reconnectAttempts), 8000)
          reconnectAttempts++
          scheduleReconnect(delay)
        },
      })
    }

    connect(lastEventIdRef.current).catch((err) => {
      if (doneFlag.current) return
      doneFlag.current = true
      callbacksRef.current.onIsLoadingChange?.(false)
      console.debug("[session-stream] WebSocket unavailable:", err)
    })

    const handleVisibilityChange = () => {
      if (document.hidden || doneFlag.current) return
      if (
        !ws ||
        (ws.readyState !== WebSocket.CONNECTING &&
          ws.readyState !== WebSocket.OPEN)
      ) {
        teardownSocket()
        reconnectAttempts = 0
        slowReconnectAttempts = 0
        if (reconnectTimer === null)
          connect(lastEventIdRef.current).catch(console.debug)
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)

    // Desktop wake signal. After a sleep the socket can still report OPEN while
    // actually dead (the server heartbeat hasn't terminated it yet), so a plain
    // readyState check — like visibilitychange does — would miss it. Force a
    // fresh reconnect: tearing down a healthy socket only costs a cheap
    // resubscribe-from-lastEventId, which is lossless.
    const unsubscribeResume = window.electronAPI?.onSystemResume?.(() => {
      if (doneFlag.current) return
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      reconnectAttempts = 0
      slowReconnectAttempts = 0
      teardownSocket()
      connect(lastEventIdRef.current).catch(console.debug)
    })

    const pendingToolStart = pendingToolStartRef.current
    return () => {
      doneFlag.current = true
      agentRunningRef.current = false
      sessionDoneFlags.delete(sessionId)
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      if (flushTimeoutRef.current !== null) {
        clearTimeout(flushTimeoutRef.current)
        flushTimeoutRef.current = null
      }
      if (reconnectTimer !== null) clearTimeout(reconnectTimer)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      unsubscribeResume?.()
      eventQueueRef.current = []
      pendingToolStart.clear()
      unsubscribe?.()
      ws?.close()
    }
  }, [sessionId, enqueue, enqueueNow, queryClient])

  return {
    lastPromptRef,
    pendingThinkingLevelRef,
  }
}
