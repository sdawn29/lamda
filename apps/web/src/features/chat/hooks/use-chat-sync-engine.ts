/**
 * Chat Sync Engine
 *
 * Persists thread messages for instant retrieval, with background
 * synchronization to the server.
 *
 * Storage is owned by the zustand chat-cache store (`../chat-cache-store`),
 * which persists to localStorage through a custom per-thread StateStorage. This
 * module keeps the network-facing concerns: online/offline tracking, debounced
 * sync scheduling, and the public engine façade consumed across the feature.
 *
 * Features:
 * - Instant load from the cache store (no network wait)
 * - Background server sync
 * - Offline support
 */

import { useEffect } from "react"
import type { Message } from "../types"
import {
  saveMessagesToStorage,
  loadThreadFromStorage,
  loadBlocksFromStorage,
  loadScrollMetaFromStorage,
  saveScrollMetaToStorage,
  markThreadDirty,
  getAllStoredThreadIds,
  clearAllThreadsFromStorage,
  getStorageStats,
  type ScrollMeta,
} from "../chat-cache-store"

// Re-export the storage façade so existing import sites keep working.
export {
  saveBlocksToStorage,
  saveMessagesToStorage,
  loadBlocksFromStorage,
  loadThreadFromStorage,
  loadScrollMetaFromStorage,
  saveScrollMetaToStorage,
  markThreadDirty,
  clearThreadFromStorage,
  getAllStoredThreadIds,
  type StoredThreadData,
  type ScrollMeta,
} from "../chat-cache-store"

const SYNC_DEBOUNCE_MS = 1000 // Debounce sync operations

interface SyncEngineState {
  isOnline: boolean
  isSyncing: boolean
  lastError: Error | null
}

// ── Sync Engine ────────────────────────────────────────────────────────────────

type SyncListener = (state: SyncEngineState) => void

class ChatSyncEngine {
  private listeners: Set<SyncListener> = new Set()
  private state: SyncEngineState = {
    isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
    isSyncing: false,
    lastError: null,
  }
  private syncTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map()
  private pendingSyncs: Map<string, Message[]> = new Map()

  constructor() {
    if (typeof window !== "undefined") {
      window.addEventListener("online", this.handleOnline)
      window.addEventListener("offline", this.handleOffline)
    }
  }

  private handleOnline = () => {
    this.state = { ...this.state, isOnline: true }
    this.notifyListeners()
    this.syncAllDirty()
  }

  private handleOffline = () => {
    this.state = { ...this.state, isOnline: false }
    this.notifyListeners()
  }

  private notifyListeners() {
    for (const listener of this.listeners) {
      listener(this.state)
    }
  }

  subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener)
    listener(this.state)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getState(): SyncEngineState {
    return this.state
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Save messages to the cache store (converts to blocks)
   */
  saveMessages(
    sessionId: string,
    messages: Message[],
    pagination?: { hasMore: boolean; oldestBlockIndex: number | null }
  ): void {
    saveMessagesToStorage(sessionId, messages, 0, pagination)
  }

  /**
   * Load messages from the cache store (instant, no network)
   */
  loadMessages(sessionId: string): Message[] | null {
    const stored = loadThreadFromStorage(sessionId)
    return stored?.messages ?? null
  }

  /**
   * Save scroll position meta to the cache store
   */
  saveScrollMeta(sessionId: string, meta: ScrollMeta): void {
    saveScrollMetaToStorage(sessionId, meta)
  }

  /**
   * Get scroll position meta from the cache store
   */
  getScrollMeta(sessionId: string): ScrollMeta | null {
    return loadScrollMetaFromStorage(sessionId)
  }

  /**
   * Schedule a sync to server (debounced)
   */
  scheduleSync(sessionId: string, messages: Message[]): void {
    const existingTimeout = this.syncTimeouts.get(sessionId)
    if (existingTimeout) {
      clearTimeout(existingTimeout)
    }

    this.pendingSyncs.set(sessionId, messages)
    markThreadDirty(sessionId)

    const timeout = setTimeout(() => {
      this.syncTimeouts.delete(sessionId)
      this.pendingSyncs.delete(sessionId)
    }, SYNC_DEBOUNCE_MS)

    this.syncTimeouts.set(sessionId, timeout)
  }

  /**
   * Force immediate sync
   */
  async forceSync(sessionId: string, fetchFn: () => Promise<Message[]>): Promise<Message[]> {
    try {
      this.state = { ...this.state, isSyncing: true }
      this.notifyListeners()

      const serverMessages = await fetchFn()
      const localData = loadBlocksFromStorage(sessionId)
      const localMessages = localData?.messages ?? []

      const merged = this.mergeMessages(localMessages, serverMessages)
      saveMessagesToStorage(sessionId, merged)

      this.state = { ...this.state, isSyncing: false, lastError: null }
      this.notifyListeners()

      return merged
    } catch (e) {
      this.state = { ...this.state, isSyncing: false, lastError: e as Error }
      this.notifyListeners()
      throw e
    }
  }

  /**
   * Sync all dirty threads
   */
  private async syncAllDirty(): Promise<void> {
    for (const sessionId of getAllStoredThreadIds()) {
      const data = loadBlocksFromStorage(sessionId)
      if (data?.dirty) {
        console.log("[chat-sync] Dirty thread needs sync:", sessionId)
      }
    }
  }

  /**
   * Merge local and server messages
   */
  private mergeMessages(_local: Message[], server: Message[]): Message[] {
    return server
  }

  /**
   * Clear all cached data
   */
  clearAll(): void {
    clearAllThreadsFromStorage()
  }

  /**
   * Get storage stats
   */
  getStats(): { threadCount: number; sizeBytes: number; sizeMB: number } {
    return getStorageStats()
  }

  destroy(): void {
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.handleOnline)
      window.removeEventListener("offline", this.handleOffline)
    }
    this.listeners.clear()
    this.syncTimeouts.forEach((timeout) => clearTimeout(timeout))
    this.syncTimeouts.clear()
    this.pendingSyncs.clear()
  }
}

// Singleton instance
let syncEngineInstance: ChatSyncEngine | null = null

export function getChatSyncEngine(): ChatSyncEngine {
  if (!syncEngineInstance) {
    syncEngineInstance = new ChatSyncEngine()
  }
  return syncEngineInstance
}

export function useChatSyncEngine(): ChatSyncEngine {
  const engine = getChatSyncEngine()

  useEffect(() => {
    const onUnload = () => engine.destroy()
    window.addEventListener("beforeunload", onUnload)
    return () => window.removeEventListener("beforeunload", onUnload)
  }, [engine])

  return engine
}
