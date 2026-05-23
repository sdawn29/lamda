import { create } from "zustand"
import { openGlobalWebSocket } from "./api"

export type ThreadStatus = "streaming" | "completed" | "idle" | "error"

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
    // localStorage quota issues — ignore
  }
}

// Module-level timer registry — not reactive state, never drives re-renders
const timers: Record<string, ReturnType<typeof setTimeout>> = {}

function startTimer(threadId: string): void {
  if (timers[threadId]) return
  timers[threadId] = setTimeout(() => {
    delete timers[threadId]
    const statuses = useThreadStatusStore.getState().statuses
    if ((statuses[threadId] ?? "idle") === "completed") {
      useThreadStatusStore.setState((s) => ({
        statuses: { ...s.statuses, [threadId]: "idle" },
      }))
    }
  }, COMPLETED_VIEW_TIMEOUT_MS)
}

function cancelTimer(threadId: string): void {
  if (timers[threadId]) {
    clearTimeout(timers[threadId])
    delete timers[threadId]
  }
}

interface ThreadStatusStore {
  statuses: Record<string, ThreadStatus>
  activeThreadId: string | null
  setStatus: (threadId: string, status: ThreadStatus) => void
  setActiveThreadId: (threadId: string | null) => void
}

export const useThreadStatusStore = create<ThreadStatusStore>()((set, get) => ({
  statuses: {},
  activeThreadId: null,

  setStatus: (threadId, status) => {
    // Error state persists until a new stream starts — ignore other overrides.
    if (status !== "streaming" && (get().statuses[threadId] ?? "idle") === "error") return

    if (status === "streaming") markThreadStreamed(threadId)

    set((s) => ({ statuses: { ...s.statuses, [threadId]: status } }))

    if (status === "completed" && get().activeThreadId === threadId) {
      // Thread finished while user is viewing it — start countdown to idle.
      startTimer(threadId)
    } else if (status !== "completed") {
      // No longer completed — cancel any pending transition timer.
      cancelTimer(threadId)
    }
  },

  setActiveThreadId: (threadId) => {
    const prev = get().activeThreadId
    if (prev) cancelTimer(prev)

    set({ activeThreadId: threadId })

    // If the incoming thread is already completed, start the countdown.
    if (threadId && (get().statuses[threadId] ?? "idle") === "completed") {
      startTimer(threadId)
    }
  },
}))

// ── Public hooks ──────────────────────────────────────────────────────────────

/**
 * Returns the live status for a single thread. Only re-renders when *this*
 * thread's status changes — other threads' changes are invisible to this hook.
 */
export function useThreadStatus(threadId: string): ThreadStatus {
  return useThreadStatusStore((s) => s.statuses[threadId] ?? "idle")
}

export function useSetThreadStatus() {
  return useThreadStatusStore.getState().setStatus
}

export function useSetActiveThreadId() {
  return useThreadStatusStore.getState().setActiveThreadId
}

// ── WebSocket bootstrap ───────────────────────────────────────────────────────

/**
 * Called once from main.tsx at app startup. Sets up the global WebSocket that
 * receives real-time thread status updates from the server.
 */
export function initThreadStatusWebSocket(): void {
  openGlobalWebSocket()
    .then((socket) => {
      if (!socket) return

      socket.addEventListener("message", (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data as string) as {
            type: string
            threadId?: string
            status?: "streaming" | "idle"
          }

          if (data.type === "thread_status" && data.threadId && data.status) {
            const { setStatus } = useThreadStatusStore.getState()
            if (data.status === "idle") {
              const streamed = getStreamedThreads()
              setStatus(data.threadId, streamed.has(data.threadId) ? "completed" : "idle")
            } else {
              setStatus(data.threadId, data.status)
            }
          }
        } catch (error) {
          console.error("[thread-status]", error)
        }
      })

      socket.addEventListener("error", () => {})
    })
    .catch((error) => {
      console.debug("[thread-status] WebSocket unavailable:", error)
    })
}
