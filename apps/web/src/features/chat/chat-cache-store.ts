/**
 * Chat Cache Store
 *
 * The persistence layer behind the chat sync engine. Thread message blocks and
 * per-thread scroll positions live in zustand stores; persistence is delegated
 * to zustand's `persist` middleware, but through a *custom* StateStorage that
 * keeps the original on-disk layout — one `lamda:chat:<id>` key per thread plus
 * a `lamda:chat:index` and `lamda:chat:scroll:<id>` keys.
 *
 * Why a custom StateStorage instead of a single consolidated key:
 * - Per-thread keys mean a write only touches the thread that changed (the
 *   storage layer diffs each entry's serialized value against the last write,
 *   so unchanged threads are never re-written to localStorage).
 * - The 50 MB / 50-thread quota cleanup is preserved.
 * - Hydration stays lazy (`skipHydration`): threads are read off disk on first
 *   access rather than all 50 MB being pulled into memory at startup.
 */

import { create } from "zustand"
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware"
import type { Message, MessageBlock, ErrorMessage } from "./types"
import { blocksToMessages } from "./types"

const STORAGE_PREFIX = "lamda:chat:"
const INDEX_KEY = `${STORAGE_PREFIX}index`
const SCROLL_PREFIX = `${STORAGE_PREFIX}scroll:`
// persist() `name`s — only used as opaque identifiers; the custom StateStorage
// ignores them and reads/writes the per-thread keys directly.
const THREAD_CACHE_KEY = "lamda:chat:cache"
const SCROLL_CACHE_KEY = "lamda:chat:scroll-cache"
const MAX_STORAGE_SIZE = 50 * 1024 * 1024 // 50MB limit
const MAX_THREADS_STORED = 50 // Max threads to cache

export interface StoredThreadData {
  blocks: MessageBlock[]
  messages: Message[] // Derived from blocks for UI
  lastSyncedAt: number
  serverVersion: number
  dirty: boolean
  /** True when the server has more (older) blocks than what is stored here. */
  hasMore?: boolean
  /**
   * blockIndex of the oldest stored block — used as the cursor for
   * `fetchPreviousPage` after a refresh so pagination can continue.
   * null means we don't know (old format or no blocks stored).
   */
  oldestBlockIndex?: number | null
}

export interface ScrollMeta {
  /** Legacy/pinned fallback — only used verbatim when there's no anchor to restore against. */
  scrollTop: number
  isPinned: boolean
  visited: boolean
  /**
   * Anchor used to restore a scrolled-up (non-pinned) position: the group key
   * that sat at `anchorOffset` px from the viewport top when saved. Restoring
   * by re-locating this element and correcting by the offset is robust to
   * `content-visibility: auto` size estimates changing between visits, unlike
   * replaying the raw `scrollTop` (which drifts as the group elements below
   * an unmeasured position get remeasured with real, not estimated, heights).
   */
  anchorGroupKey?: string
  anchorOffset?: number
}

function threadKey(sessionId: string): string {
  return `${STORAGE_PREFIX}${sessionId}`
}

function scrollKey(sessionId: string): string {
  return `${SCROLL_PREFIX}${sessionId}`
}

// ── localStorage helpers (per-thread key layout) ────────────────────────────────

function readIndex(): string[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

function writeIndex(ids: string[]): void {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(ids))
  } catch (e) {
    console.warn("[chat-cache] Failed to update threads index:", e)
  }
}

function getStorageSize(): number {
  let total = 0
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith(STORAGE_PREFIX)) {
      const value = localStorage.getItem(key)
      if (value) total += key.length + value.length
    }
  }
  return total
}

/**
 * Mirrors the last serialized value written for each localStorage key so the
 * persist StateStorage can skip re-writing entries that did not change — this
 * is what keeps a save scoped to the single thread that was touched.
 */
const writeCache = new Map<string, string>()

function cleanOldThreads(keepIds: Set<string>): void {
  const currentIds = readIndex()
  for (const id of currentIds) {
    if (keepIds.has(id)) continue
    try {
      localStorage.removeItem(threadKey(id))
      writeCache.delete(threadKey(id))
    } catch (e) {
      console.warn("[chat-cache] Failed to remove old thread:", id, e)
    }
  }
  writeIndex(currentIds.filter((id) => keepIds.has(id)))
}

function removeThreadFromDisk(sessionId: string): void {
  try {
    localStorage.removeItem(threadKey(sessionId))
    writeCache.delete(threadKey(sessionId))
    writeIndex(readIndex().filter((id) => id !== sessionId))
  } catch (e) {
    console.warn("[chat-cache] Failed to clear thread:", sessionId, e)
  }
}

function readThreadFromDisk(sessionId: string): StoredThreadData | null {
  try {
    const raw = localStorage.getItem(threadKey(sessionId))
    if (!raw) return null
    const data = JSON.parse(raw) as StoredThreadData
    if (!Array.isArray(data.blocks)) return null
    return data
  } catch (e) {
    console.warn("[chat-cache] Failed to load blocks from storage:", sessionId, e)
    return null
  }
}

// ── Custom per-thread StateStorage for the thread cache ──────────────────────────

/**
 * Fans the in-memory `threads` record out into one localStorage key per thread.
 * Upserts are additive — a thread absent from the persisted state is left on
 * disk (lazy hydration only ever holds a subset in memory). Explicit deletion
 * goes through `removeThreadFromDisk`.
 */
const threadCacheStorage: StateStorage = {
  getItem: () => {
    const threads: Record<string, StoredThreadData> = {}
    for (const id of readIndex()) {
      const data = readThreadFromDisk(id)
      if (data) threads[id] = data
    }
    return JSON.stringify({ state: { threads }, version: 0 })
  },
  setItem: (_name, value) => {
    let threads: Record<string, StoredThreadData>
    try {
      threads = (JSON.parse(value) as { state?: { threads?: Record<string, StoredThreadData> } })
        .state?.threads ?? {}
    } catch {
      return
    }

    const ids = readIndex()
    const idSet = new Set(ids)
    let wroteAny = false

    for (const [id, data] of Object.entries(threads)) {
      const serialized = JSON.stringify(data)
      const key = threadKey(id)
      // Skip threads whose serialized value is unchanged since the last write.
      if (writeCache.get(key) === serialized) continue
      try {
        localStorage.setItem(key, serialized)
        writeCache.set(key, serialized)
        wroteAny = true
      } catch (e) {
        if (e instanceof DOMException && e.name === "QuotaExceededError") {
          cleanOldThreads(new Set())
          try {
            localStorage.setItem(key, serialized)
            writeCache.set(key, serialized)
            wroteAny = true
          } catch {
            console.error("[chat-cache] Still failed after cleanup")
          }
        } else {
          console.warn("[chat-cache] Failed to save blocks to storage:", id, e)
        }
      }
      if (!idSet.has(id)) {
        ids.unshift(id)
        idSet.add(id)
      }
    }

    if (wroteAny) {
      writeIndex(ids)
      if (getStorageSize() > MAX_STORAGE_SIZE) {
        cleanOldThreads(new Set(ids.slice(0, MAX_THREADS_STORED)))
      }
    }
  },
  removeItem: () => {
    for (const id of readIndex()) {
      try {
        localStorage.removeItem(threadKey(id))
      } catch {
        // ignore
      }
    }
    try {
      localStorage.removeItem(INDEX_KEY)
    } catch {
      // ignore
    }
    writeCache.clear()
  },
}

// ── Custom per-thread StateStorage for scroll meta ───────────────────────────────

const scrollMetaStorage: StateStorage = {
  getItem: () => {
    const scroll: Record<string, ScrollMeta> = {}
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key?.startsWith(SCROLL_PREFIX)) continue
      try {
        const raw = localStorage.getItem(key)
        if (raw) scroll[key.slice(SCROLL_PREFIX.length)] = JSON.parse(raw) as ScrollMeta
      } catch {
        // ignore corrupt entry
      }
    }
    return JSON.stringify({ state: { scroll }, version: 0 })
  },
  setItem: (_name, value) => {
    let scroll: Record<string, ScrollMeta>
    try {
      scroll = (JSON.parse(value) as { state?: { scroll?: Record<string, ScrollMeta> } }).state
        ?.scroll ?? {}
    } catch {
      return
    }
    for (const [id, meta] of Object.entries(scroll)) {
      const serialized = JSON.stringify(meta)
      const key = scrollKey(id)
      if (writeCache.get(key) === serialized) continue
      try {
        localStorage.setItem(key, serialized)
        writeCache.set(key, serialized)
      } catch (e) {
        console.warn("[chat-cache] Failed to save scroll meta:", e)
      }
    }
  },
  removeItem: () => {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (key?.startsWith(SCROLL_PREFIX)) {
        try {
          localStorage.removeItem(key)
          writeCache.delete(key)
        } catch {
          // ignore
        }
      }
    }
  },
}

// ── messages → blocks conversion (for storage) ───────────────────────────────────

/**
 * Convert UI messages to blocks for storage.
 */
function messagesToBlocks(messages: Message[]): MessageBlock[] {
  return messages.map((msg, index) => {
    // Handle error messages by converting them to assistant blocks
    if (msg.role === "error") {
      const errorMsg = msg as ErrorMessage
      return {
        id: crypto.randomUUID(),
        threadId: "",
        blockIndex: index,
        role: "assistant" as const,
        content: errorMsg.message,
        thinking: null,
        model: null,
        provider: null,
        thinkingLevel: null,
        responseTime: null,
        errorMessage: errorMsg.message,
        toolCallId: null,
        toolName: null,
        toolArgs: null,
        toolResult: null,
        toolStatus: null,
        toolDuration: null,
        toolStartTime: null,
        createdAt: Date.now(),
      } as MessageBlock
    }

    // Build base block (non-error roles only)
    const base: MessageBlock = {
      id: crypto.randomUUID(),
      threadId: "", // Will be set by server
      blockIndex: index,
      role: msg.role as "user" | "assistant" | "tool",
      content: null,
      thinking: null,
      model: null,
      provider: null,
      thinkingLevel: null,
      responseTime: null,
      errorMessage: null,
      toolCallId: null,
      toolName: null,
      toolArgs: null,
      toolResult: null,
      toolStatus: null,
      toolDuration: null,
      toolStartTime: null,
      attachments: null,
      createdAt: Date.now(),
    }

    switch (msg.role) {
      case "user":
        return { ...base, content: msg.content, createdAt: msg.createdAt ?? Date.now() }
      case "assistant":
        return {
          ...base,
          content: msg.content,
          thinking: msg.thinking || null,
          model: msg.model ?? null,
          provider: msg.provider ?? null,
          thinkingLevel: msg.thinkingLevel ?? null,
          responseTime: msg.responseTime ?? null,
          errorMessage: msg.errorMessage ?? null,
          createdAt: msg.createdAt ?? Date.now(),
        }
      case "tool":
        return {
          ...base,
          toolCallId: msg.toolCallId,
          toolName: msg.toolName,
          toolArgs: typeof msg.args === "string" ? msg.args : JSON.stringify(msg.args),
          toolResult: msg.result
            ? typeof msg.result === "string"
              ? msg.result
              : JSON.stringify(msg.result)
            : null,
          toolStatus: msg.status,
          toolDuration: msg.duration ?? null,
          toolStartTime: msg.startTime ?? null,
        }
      default:
        return base
    }
  })
}

// ── Thread cache store ───────────────────────────────────────────────────────────

interface ThreadCacheState {
  /** In-memory mirror of persisted threads. Populated lazily on first access. */
  threads: Record<string, StoredThreadData>
  getThread: (sessionId: string) => StoredThreadData | null
  saveBlocks: (
    sessionId: string,
    blocks: MessageBlock[],
    serverVersion?: number,
    pagination?: { hasMore: boolean; oldestBlockIndex: number | null }
  ) => void
  markDirty: (sessionId: string) => void
  clearThread: (sessionId: string) => void
  clearAll: () => void
  allThreadIds: () => string[]
  getStats: () => { threadCount: number; sizeBytes: number; sizeMB: number }
}

const useThreadCacheStore = create<ThreadCacheState>()(
  persist(
    (set, get) => ({
      threads: {},

      getThread: (sessionId) => {
        const inMemory = get().threads[sessionId]
        if (inMemory) return inMemory
        const fromDisk = readThreadFromDisk(sessionId)
        if (fromDisk) {
          // Prime the write cache so re-inserting into memory does not trigger a
          // redundant disk write of the just-read value.
          writeCache.set(threadKey(sessionId), JSON.stringify(fromDisk))
          set((s) => ({ threads: { ...s.threads, [sessionId]: fromDisk } }))
        }
        return fromDisk
      },

      saveBlocks: (sessionId, blocks, serverVersion = 0, pagination) => {
        const data: StoredThreadData = {
          blocks,
          messages: blocksToMessages(blocks),
          lastSyncedAt: Date.now(),
          serverVersion,
          dirty: false,
          hasMore: pagination?.hasMore,
          oldestBlockIndex: pagination?.oldestBlockIndex ?? null,
        }
        set((s) => ({ threads: { ...s.threads, [sessionId]: data } }))
      },

      markDirty: (sessionId) => {
        const data = get().getThread(sessionId)
        if (!data) return
        set((s) => ({
          threads: { ...s.threads, [sessionId]: { ...data, dirty: true } },
        }))
      },

      clearThread: (sessionId) => {
        removeThreadFromDisk(sessionId)
        set((s) => {
          const next = { ...s.threads }
          delete next[sessionId]
          return { threads: next }
        })
      },

      clearAll: () => {
        set({ threads: {} })
        threadCacheStorage.removeItem(THREAD_CACHE_KEY)
      },

      allThreadIds: () => readIndex(),

      getStats: () => {
        const sizeBytes = getStorageSize()
        return {
          threadCount: readIndex().length,
          sizeBytes,
          sizeMB: Math.round((sizeBytes / 1024 / 1024) * 100) / 100,
        }
      },
    }),
    {
      name: THREAD_CACHE_KEY,
      // createJSONStorage bridges the string-based StateStorage to the object
      // (StorageValue) interface persist expects.
      storage: createJSONStorage(() => threadCacheStorage),
      partialize: (s) => ({ threads: s.threads }),
      // Threads are read off disk on demand (see getThread) rather than pulling
      // the whole cache into memory at startup.
      skipHydration: true,
    }
  )
)

// ── Scroll meta store ────────────────────────────────────────────────────────────

interface ScrollMetaState {
  scroll: Record<string, ScrollMeta>
  getScroll: (sessionId: string) => ScrollMeta | null
  setScroll: (sessionId: string, meta: ScrollMeta) => void
}

const useScrollMetaStore = create<ScrollMetaState>()(
  persist(
    (set, get) => ({
      scroll: {},

      getScroll: (sessionId) => {
        const inMemory = get().scroll[sessionId]
        if (inMemory) return inMemory
        try {
          const raw = localStorage.getItem(scrollKey(sessionId))
          if (!raw) return null
          const meta = JSON.parse(raw) as ScrollMeta
          writeCache.set(scrollKey(sessionId), raw)
          set((s) => ({ scroll: { ...s.scroll, [sessionId]: meta } }))
          return meta
        } catch (e) {
          console.warn("[chat-cache] Failed to load scroll meta:", e)
          return null
        }
      },

      setScroll: (sessionId, meta) => {
        set((s) => ({ scroll: { ...s.scroll, [sessionId]: meta } }))
      },
    }),
    {
      name: SCROLL_CACHE_KEY,
      storage: createJSONStorage(() => scrollMetaStorage),
      partialize: (s) => ({ scroll: s.scroll }),
      skipHydration: true,
    }
  )
)

// ── Public façade (stable signatures used across the chat feature) ───────────────

export function saveBlocksToStorage(
  sessionId: string,
  blocks: MessageBlock[],
  serverVersion = 0,
  pagination?: { hasMore: boolean; oldestBlockIndex: number | null }
): void {
  useThreadCacheStore.getState().saveBlocks(sessionId, blocks, serverVersion, pagination)
}

export function saveMessagesToStorage(
  sessionId: string,
  messages: Message[],
  serverVersion = 0,
  pagination?: { hasMore: boolean; oldestBlockIndex: number | null }
): void {
  saveBlocksToStorage(sessionId, messagesToBlocks(messages), serverVersion, pagination)
}

export function loadBlocksFromStorage(sessionId: string): StoredThreadData | null {
  return useThreadCacheStore.getState().getThread(sessionId)
}

export function loadThreadFromStorage(sessionId: string): {
  messages: Message[]
  hasMore: boolean
  oldestBlockIndex: number | null
} | null {
  const stored = useThreadCacheStore.getState().getThread(sessionId)
  if (!stored) return null
  return {
    messages: stored.messages,
    hasMore: stored.hasMore ?? false,
    oldestBlockIndex: stored.oldestBlockIndex ?? null,
  }
}

export function markThreadDirty(sessionId: string): void {
  useThreadCacheStore.getState().markDirty(sessionId)
}

export function clearThreadFromStorage(sessionId: string): void {
  useThreadCacheStore.getState().clearThread(sessionId)
}

export function getAllStoredThreadIds(): string[] {
  return useThreadCacheStore.getState().allThreadIds()
}

export function clearAllThreadsFromStorage(): void {
  useThreadCacheStore.getState().clearAll()
}

export function getStorageStats(): { threadCount: number; sizeBytes: number; sizeMB: number } {
  return useThreadCacheStore.getState().getStats()
}

export function saveScrollMetaToStorage(sessionId: string, meta: ScrollMeta): void {
  useScrollMetaStore.getState().setScroll(sessionId, meta)
}

export function loadScrollMetaFromStorage(sessionId: string): ScrollMeta | null {
  return useScrollMetaStore.getState().getScroll(sessionId)
}
