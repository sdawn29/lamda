import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import { toast } from "sonner"
import { openGlobalWebSocket } from "./api"
import { queryClient } from "@/shared/lib/query-client"
import { gitKeys } from "@/features/git/queries"
import {
  workspaceKeys,
  modeKeys,
  agentKeys,
} from "@/features/workspace/queries"
import type { WorkspaceDto } from "@/features/workspace/api"
import { automationKeys } from "@/features/automations/queries"
import { semanticSearchKeys } from "@/features/semantic-search"
import {
  MANAGED_NOTIFICATION_TOAST_PREFIX,
  useNotificationStore,
} from "@/features/notifications"

export type ThreadStatus =
  | "streaming"
  | "completed"
  | "idle"
  | "error"
  | "awaiting"

/** Why a thread is awaiting the user. */
export type ThreadAwaitingReason = "approval" | "question"

/**
 * Context explaining a thread's `awaiting` / `error` status, used to write a
 * precise notification: what kind of prompt is pending and a short specific
 * (tool name, question text, or error message).
 */
export interface ThreadAttention {
  reason?: ThreadAwaitingReason
  detail?: string
}

const STREAMED_THREADS_KEY = "lamda:streamed-threads"
const COMPLETED_VIEW_TIMEOUT_MS = 5000

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
  /** Per-thread context for the latest awaiting/error status, for notifications. */
  attention: Record<string, ThreadAttention>
  activeThreadId: string | null
  /**
   * Threads that have streamed at least once. Persisted to localStorage so an
   * "idle" status arriving after a reload can be shown as "completed".
   */
  streamedThreads: Record<string, true>
  isThreadStreamed: (threadId: string) => boolean
  setStatus: (threadId: string, status: ThreadStatus) => void
  setActiveThreadId: (threadId: string | null) => void
}

export const useThreadStatusStore = create<ThreadStatusStore>()(
  persist(
    (set, get) => ({
      statuses: {},
      attention: {},
      activeThreadId: null,
      streamedThreads: {},

      isThreadStreamed: (threadId) => Boolean(get().streamedThreads[threadId]),

      setStatus: (threadId, status) => {
        // Error state persists until a new stream starts — ignore other overrides.
        if (
          status !== "streaming" &&
          (get().statuses[threadId] ?? "idle") === "error"
        )
          return

        if (status === "streaming" && !get().streamedThreads[threadId]) {
          set((s) => ({
            streamedThreads: { ...s.streamedThreads, [threadId]: true },
          }))
        }

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
    }),
    {
      name: STREAMED_THREADS_KEY,
      storage: createJSONStorage(() => localStorage),
      // Only the streamed-thread set is durable; live statuses are per-session.
      partialize: (s) => ({ streamedThreads: s.streamedThreads }),
    }
  )
)

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

export function subscribeToWorkspaceFileUpdates(
  fn: WorkspaceFileUpdateListener
): () => void {
  workspaceFileUpdateListeners.add(fn)
  return () => workspaceFileUpdateListeners.delete(fn)
}

// ── WebSocket bootstrap ───────────────────────────────────────────────────────

let globalSocket: WebSocket | null = null
let globalReconnectTimer: ReturnType<typeof setTimeout> | null = null
let globalReconnectDelay = 1000
const GLOBAL_MAX_RECONNECT_DELAY = 30_000

function workspaceLabel(workspaceId: string, workspaceName?: string): string {
  if (workspaceName?.trim()) return workspaceName.trim()
  const workspaces = queryClient.getQueryData<WorkspaceDto[]>(workspaceKeys.all)
  const cachedName = workspaces?.find((w) => w.id === workspaceId)?.name
  return cachedName ?? `workspace ${workspaceId.slice(0, 8)}`
}

function handleGlobalMessage(e: MessageEvent): void {
  try {
    const data = JSON.parse(e.data as string) as {
      type: string
      threadId?: string
      status?: "streaming" | "idle" | "awaiting" | "error"
      reason?: ThreadAwaitingReason
      detail?: string
      workspaceId?: string
      workspaceName?: string
      root?: string
      dir?: string
      phase?: "chunking" | "embedding" | "idle" | "error"
      current?: number
      total?: number
      initial?: boolean
      processed?: number
      embedded?: number
      error?: string
    }
    if (data.type === "worktree_detached") {
      // The server auto-detached a thread from a worktree that was removed
      // out-of-band; refresh the thread list (holds worktreePath for the
      // selector) and all git/file views so cwd-scoped data re-reads.
      queryClient.invalidateQueries({ queryKey: workspaceKeys.all })
      void queryClient.invalidateQueries({ queryKey: gitKeys.all })
      if (data.workspaceId) {
        queryClient.invalidateQueries({
          queryKey: workspaceKeys.files(data.workspaceId),
        })
        for (const fn of workspaceFileUpdateListeners) fn(data.workspaceId)
      }
    }
    if (data.type === "automations_changed") {
      // An automation was created/edited/deleted, or a run started/finished
      // (which may have created a dedicated thread). Refresh the automations
      // list, their run histories, and the workspace/thread tree.
      void queryClient.invalidateQueries({ queryKey: automationKeys.all })
      void queryClient.invalidateQueries({ queryKey: automationKeys.runsAll })
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.all })
    }
    if (data.type === "thread_status" && data.threadId && data.status) {
      const { setStatus, isThreadStreamed } = useThreadStatusStore.getState()
      // Record the context (why awaiting / what error) BEFORE flipping status,
      // so the notification listener — which fires on the status change — reads
      // the matching detail. Cleared on non-attention statuses to avoid staleness.
      const attention: ThreadAttention =
        data.status === "awaiting" || data.status === "error"
          ? { reason: data.reason, detail: data.detail }
          : {}
      useThreadStatusStore.setState((s) => ({
        attention: { ...s.attention, [data.threadId as string]: attention },
      }))
      if (data.status === "idle") {
        setStatus(
          data.threadId,
          isThreadStreamed(data.threadId) ? "completed" : "idle"
        )
      } else {
        // "streaming", "awaiting" and "error" map through directly.
        setStatus(data.threadId, data.status)
      }
    }
    if (
      data.type === "workspace_dir_changed" &&
      data.root &&
      data.dir !== undefined
    ) {
      // Scoped delta: re-read just the one directory whose children changed.
      // Keyed by `root` (workspace or worktree path) to match the tree query.
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.dir(data.root, data.dir),
      })
    }
    if (data.type === "modes_changed") {
      // A mode file was added/edited/removed (global or workspace-local).
      // Refetch every mounted mode picker — each is keyed by workspace, and a
      // global mode is visible to all of them.
      void queryClient.invalidateQueries({ queryKey: modeKeys.all })
    }
    if (data.type === "agents_changed") {
      // An agent file was added/edited/removed (global or workspace-local).
      // Refetch every mounted agent list (Settings → Agents).
      void queryClient.invalidateQueries({ queryKey: agentKeys.all })
    }
    if (data.type === "prompts_changed") {
      // A prompt file was added/edited/removed (global or workspace-local).
      // Refetch every mounted slash-command list. These are keyed per session
      // (`["chat","session",id,"commands"]`) and per workspace
      // (`["chat","workspace",id,"commands"]`); match both by their trailing
      // "commands" segment, and a global prompt is visible to all of them.
      void queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey
          return (
            Array.isArray(key) &&
            key[0] === "chat" &&
            key[key.length - 1] === "commands"
          )
        },
      })
    }
    if (data.type === "workspace_files_updated" && data.workspaceId) {
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.files(data.workspaceId),
      })
      for (const fn of workspaceFileUpdateListeners) fn(data.workspaceId)
    }
    if (data.type === "git_status_changed") {
      // Invalidates status, diff-stat, turns, branch, ahead-behind, etc. for all
      // mounted sessions. Skips per-file diffs (key[3] === "diff") and per-turn
      // file diffs (key[3] === "turn-file-diff") — those are keyed per file and
      // are O(N files) active observers, so broadcasting against all of them on
      // every .git write causes a request explosion during active agent runs.
      // Working-tree file diffs become stale naturally when the status query
      // updates (new statusCode → new query key); a completed turn's file diff is
      // immutable once the next turn lands (its post-state is frozen), and the
      // in-progress turn's diff refreshes on re-expand (staleTime 0).
      void queryClient.invalidateQueries({
        queryKey: gitKeys.all,
        predicate: (query) => {
          const k = (query.queryKey as unknown[])[3]
          return k !== "diff" && k !== "turn-file-diff"
        },
      })
      // A git status change means working-tree contents changed (the indexer's
      // root watcher fires this on every edit, not just on .git writes). The
      // `workspace_files_updated` event only fires when the *set* of file paths
      // changes, so content-only edits to an already-indexed file would never
      // refresh an open viewer. Notify the same listeners here so an open file
      // re-reads its contents from disk.
      if (data.workspaceId) {
        for (const fn of workspaceFileUpdateListeners) fn(data.workspaceId)
      }
    }
    if (
      data.type === "semantic_index_progress" &&
      data.workspaceId &&
      data.phase
    ) {
      const workspaceId = data.workspaceId
      void queryClient.invalidateQueries({
        queryKey: semanticSearchKeys.status(workspaceId),
      })
      // Also drop any cached search results — a fresh sweep may have changed them.
      void queryClient.invalidateQueries({
        queryKey: semanticSearchKeys.all,
      })
      const notificationId = `indexing-${workspaceId}`
      const name = workspaceLabel(workspaceId, data.workspaceName)
      if (data.phase === "error") {
        const description = `${name}: ${
          data.error ?? "Semantic code indexing failed."
        }`
        useNotificationStore.getState().upsert(notificationId, {
          kind: "indexing",
          title: "Code index failed",
          description,
          variant: "error",
          priority: "high",
          progress: undefined,
          workspaceId,
        })
        toast.error("Code index failed", {
          id: `${MANAGED_NOTIFICATION_TOAST_PREFIX}${notificationId}`,
          description,
        })
        return
      }
      if (data.phase === "idle") {
        // Only the completed cycle carries `initial`/`processed`
        // (set only for the first sweep since start()/reindex(), not the many
        // small incremental sweeps a busy editing session triggers), and only
        // when it actually did work — either chunking files or rebuilding local
        // vectors. An already-up-to-date workspace re-swept on app boot
        // shouldn't toast.
        const changed =
          (data.processed !== undefined && data.processed > 0) ||
          (data.embedded !== undefined && data.embedded > 0)
        if (data.initial && changed) {
          const processed = data.processed ?? 0
          const embedded = data.embedded ?? 0
          const activity =
            processed > 0
              ? `${processed} file${processed === 1 ? "" : "s"} indexed`
              : `${embedded} chunk${embedded === 1 ? "" : "s"} embedded`
          const description = `${name} - ${activity} for semantic search.`
          useNotificationStore.getState().upsert(notificationId, {
            kind: "indexing",
            title: "Code index ready",
            description,
            variant: "success",
            priority: "normal",
            progress: undefined,
            workspaceId,
          })
          toast.success("Code index ready", {
            id: `${MANAGED_NOTIFICATION_TOAST_PREFIX}${notificationId}`,
            description,
          })
        } else {
          // Sweep finished without user-relevant work. Keep any progress row as
          // quiet, accurate history, but do not create a fresh success toast.
          useNotificationStore.getState().upsert(notificationId, {
            kind: "indexing",
            title: "Code index up to date",
            description: `${name} semantic search index is idle.`,
            variant: "default",
            priority: "low",
            progress: undefined,
            workspaceId,
            read: true,
          })
        }
      } else {
        const phaseLabel = data.phase === "chunking" ? "Chunking" : "Embedding"
        const progressTotal =
          data.total !== undefined && data.total >= 0 ? data.total : 0
        useNotificationStore.getState().upsert(notificationId, {
          kind: "indexing",
          title:
            data.phase === "chunking"
              ? "Chunking workspace code"
              : "Embedding code index",
          description:
            progressTotal > 0
              ? `${name} - ${phaseLabel} ${data.current ?? 0} / ${progressTotal}`
              : `${name} - ${phaseLabel} semantic search index`,
          variant: "info",
          priority: "low",
          progress: {
            phase: phaseLabel,
            current: data.current ?? 0,
            total: progressTotal,
          },
          workspaceId,
        })
      }
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
  globalReconnectDelay = Math.min(
    globalReconnectDelay * 2,
    GLOBAL_MAX_RECONNECT_DELAY
  )
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
