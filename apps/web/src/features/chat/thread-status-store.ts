import { create } from "zustand"
import { openGlobalWebSocket } from "./api"
import { queryClient } from "@/shared/lib/query-client"

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

// ── Workspace file update pub/sub ─────────────────────────────────────────────

type WorkspaceFileUpdateListener = (workspaceId: string) => void
const workspaceFileUpdateListeners = new Set<WorkspaceFileUpdateListener>()

export function subscribeToWorkspaceFileUpdates(fn: WorkspaceFileUpdateListener): () => void {
  workspaceFileUpdateListeners.add(fn)
  return () => workspaceFileUpdateListeners.delete(fn)
}

// ── WebSocket bootstrap ───────────────────────────────────────────────────────

let globalSocket: WebSocket | null = null
let globalReconnectTimer: ReturnType<typeof setTimeout> | null = null
let globalReconnectDelay = 1000
const GLOBAL_MAX_RECONNECT_DELAY = 30_000

function handleGlobalMessage(e: MessageEvent): void {
  try {
    const data = JSON.parse(e.data as string) as {
      type: string
      threadId?: string
      status?: "streaming" | "idle"
      workspaceId?: string
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
    if (data.type === "workspace_files_updated" && data.workspaceId) {
      queryClient.invalidateQueries({ queryKey: ["workspace-files", data.workspaceId] })
      for (const fn of workspaceFileUpdateListeners) fn(data.workspaceId)
    }
  } catch (error) {
    console.error("[thread-status]", error)
  }
}

function scheduleGlobalReconnect(): void {
  if (globalReconnectTimer !== null) return
  globalReconnectTimer = setTimeout(() => {
    globalReconnectTimer = null
    connectGlobalSocket()
  }, globalReconnectDelay)
  globalReconnectDelay = Math.min(globalReconnectDelay * 2, GLOBAL_MAX_RECONNECT_DELAY)
}

function connectGlobalSocket(): void {
  if (
    globalSocket?.readyState === WebSocket.CONNECTING ||
    globalSocket?.readyState === WebSocket.OPEN
  ) {
    return
  }

  openGlobalWebSocket()
    .then((socket) => {
      if (!socket) {
        scheduleGlobalReconnect()
        return
      }
      globalSocket = socket
      globalReconnectDelay = 1000
      socket.addEventListener("message", handleGlobalMessage)
      socket.addEventListener("close", () => {
        globalSocket = null
        scheduleGlobalReconnect()
      })
      socket.addEventListener("error", () => {})
    })
    .catch(() => {
      scheduleGlobalReconnect()
    })
}

function reconnectGlobalSocketNow(): void {
  if (globalReconnectTimer !== null) {
    clearTimeout(globalReconnectTimer)
    globalReconnectTimer = null
  }
  globalReconnectDelay = 1000
  connectGlobalSocket()
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) return
  if (
    !globalSocket ||
    globalSocket.readyState === WebSocket.CLOSED ||
    globalSocket.readyState === WebSocket.CLOSING
  ) {
    reconnectGlobalSocketNow()
  }
})

/**
 * Called once from main.tsx at app startup. Sets up the global WebSocket that
 * receives real-time thread status updates from the server, and keeps it alive
 * across laptop sleep/wake cycles.
 */
export function initThreadStatusWebSocket(): void {
  connectGlobalSocket()
  window.electronAPI?.onSystemResume?.(() => {
    reconnectGlobalSocketNow()
  })
}
