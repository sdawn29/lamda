import {
  createContext,
  useCallback,
  useContext,
  useState,
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react"

import { openGlobalWebSocket } from "./api"

/**
 * Thread status aligned with PI SDK AgentState.isStreaming.
 *
 * - "streaming": agent is actively processing (isStreaming: true)
 * - "completed": was streaming, now done - shows green dot (turns to idle after 5s when viewing)
 * - "idle": agent has never streamed or has settled after completion
 */
export type ThreadStatus = "streaming" | "completed" | "idle"

// ── External store ────────────────────────────────────────────────────────────
//
// Keeping statuses outside React state means each useThreadStatus() subscriber
// only re-renders when *its own* thread changes — not every thread in the
// sidebar at once. This fixes the bug where one streaming thread caused every
// sidebar row to repaint, producing inconsistent reads under React 18's
// concurrent renderer (some rows briefly showing "streaming" when they shouldn't).

class ThreadStatusStore {
  private statuses = new Map<string, ThreadStatus>()
  private listeners = new Map<string, Set<() => void>>()

  getStatus(threadId: string): ThreadStatus {
    return this.statuses.get(threadId) ?? "idle"
  }

  set(threadId: string, status: ThreadStatus): void {
    if (this.statuses.get(threadId) === status) return
    this.statuses.set(threadId, status)
    this.listeners.get(threadId)?.forEach((fn) => fn())
  }

  subscribe(threadId: string, callback: () => void): () => void {
    let set = this.listeners.get(threadId)
    if (!set) {
      set = new Set()
      this.listeners.set(threadId, set)
    }
    set.add(callback)
    return () => {
      this.listeners.get(threadId)?.delete(callback)
    }
  }
}

const statusStore = new ThreadStatusStore()

// ── localStorage helpers ──────────────────────────────────────────────────────

const STREAMED_THREADS_KEY = "lamda:streamed-threads"
const COMPLETED_VIEW_TIMEOUT_MS = 5000

function getStreamedThreads(): Set<string> {
  try {
    const stored = localStorage.getItem(STREAMED_THREADS_KEY)
    return stored ? new Set(JSON.parse(stored)) : new Set()
  } catch {
    return new Set()
  }
}

function markThreadStreamed(threadId: string): void {
  try {
    const streamed = getStreamedThreads()
    streamed.add(threadId)
    localStorage.setItem(STREAMED_THREADS_KEY, JSON.stringify([...streamed]))
  } catch {
    // Silently fail - localStorage quota issues
  }
}

// ── Context (command surface only) ────────────────────────────────────────────

interface ThreadStatusContextValue {
  setStatus: (threadId: string, status: ThreadStatus) => void
  setActiveThreadId: (threadId: string | null) => void
}

const ThreadStatusContext = createContext<ThreadStatusContextValue | null>(null)

// ── Provider ─────────────────────────────────────────────────────────────────

export function ThreadStatusProvider({ children }: { children: ReactNode }) {
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)

  // Keep a ref so setStatus / handleSetActiveThreadId (both useCallback with
  // empty deps) can always read the latest activeThreadId without capturing it.
  const activeThreadIdRef = useRef<string | null>(null)

  // Timeout IDs for completed → idle transitions, stored in a ref to avoid
  // triggering React renders when timers are created/cleared.
  const timeoutsRef = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  // Start the completed→idle timer for a thread (no-op if already running).
  const startTimer = useCallback((threadId: string) => {
    if (timeoutsRef.current.has(threadId)) return
    const id = setTimeout(() => {
      timeoutsRef.current.delete(threadId)
      if (statusStore.getStatus(threadId) === "completed") {
        statusStore.set(threadId, "idle")
      }
    }, COMPLETED_VIEW_TIMEOUT_MS)
    timeoutsRef.current.set(threadId, id)
  }, [])

  // Cancel the timer for a thread (no-op if none running).
  const cancelTimer = useCallback((threadId: string) => {
    const id = timeoutsRef.current.get(threadId)
    if (id !== undefined) {
      clearTimeout(id)
      timeoutsRef.current.delete(threadId)
    }
  }, [])

  const setStatus = useCallback(
    (threadId: string, status: ThreadStatus) => {
      if (status === "streaming") markThreadStreamed(threadId)

      statusStore.set(threadId, status)

      if (status === "completed" && activeThreadIdRef.current === threadId) {
        // Thread finished while user is viewing it — start countdown to idle.
        startTimer(threadId)
      } else if (status !== "completed") {
        // Thread is no longer in completed state — cancel any pending timer.
        cancelTimer(threadId)
      }
    },
    [startTimer, cancelTimer],
  )

  const handleSetActiveThreadId = useCallback(
    (threadId: string | null) => {
      // Cancel the outgoing thread's timer — user is navigating away.
      if (activeThreadIdRef.current) cancelTimer(activeThreadIdRef.current)

      activeThreadIdRef.current = threadId
      setActiveThreadId(threadId)

      // If the incoming thread is already completed, start the countdown.
      if (threadId && statusStore.getStatus(threadId) === "completed") {
        startTimer(threadId)
      }
    },
    [startTimer, cancelTimer],
  )

  // Cleanup all pending timers on unmount.
  useEffect(() => {
    const timers = timeoutsRef.current
    return () => {
      timers.forEach((id) => clearTimeout(id))
      timers.clear()
    }
  }, [])

  // Real-time updates from server via global WebSocket.
  useEffect(() => {
    let active = true
    let ws: WebSocket | null = null

    openGlobalWebSocket()
      .then((socket) => {
        if (!socket || !active) {
          socket?.close()
          return
        }
        ws = socket

        ws.addEventListener("message", (e: MessageEvent) => {
          if (!active) return
          try {
            const data = JSON.parse(e.data as string) as {
              type: string
              threadId?: string
              status?: "streaming" | "idle"
            }

            if (
              data.type === "thread_status" &&
              data.threadId &&
              data.status
            ) {
              if (data.status === "idle") {
                const streamed = getStreamedThreads()
                setStatus(
                  data.threadId,
                  streamed.has(data.threadId) ? "completed" : "idle",
                )
              } else {
                setStatus(data.threadId, data.status)
              }
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
  }, [setStatus])

  // activeThreadId is only used to satisfy the context type — the real work is
  // done imperatively via activeThreadIdRef + handleSetActiveThreadId above.
  void activeThreadId

  return (
    <ThreadStatusContext.Provider
      value={{ setStatus, setActiveThreadId: handleSetActiveThreadId }}
    >
      {children}
    </ThreadStatusContext.Provider>
  )
}

// ── Public hooks ──────────────────────────────────────────────────────────────

/**
 * Returns the live status for a single thread. Only re-renders when *this*
 * thread's status changes — other threads' changes are invisible to this hook.
 */
export function useThreadStatus(threadId: string): ThreadStatus {
  return useSyncExternalStore(
    (callback) => statusStore.subscribe(threadId, callback),
    () => statusStore.getStatus(threadId),
    () => "idle" as ThreadStatus,
  )
}

export function useSetThreadStatus() {
  const ctx = useContext(ThreadStatusContext)
  if (!ctx)
    throw new Error(
      "useSetThreadStatus must be used within ThreadStatusProvider",
    )
  return ctx.setStatus
}

export function useSetActiveThreadId() {
  const ctx = useContext(ThreadStatusContext)
  if (!ctx)
    throw new Error(
      "useSetActiveThreadId must be used within ThreadStatusProvider",
    )
  return ctx.setActiveThreadId
}
