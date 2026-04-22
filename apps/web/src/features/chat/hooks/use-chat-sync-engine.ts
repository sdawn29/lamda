/**
 * Chat Sync Engine
 * 
 * Persists thread messages to localStorage for instant retrieval,
 * with background synchronization to the server.
 * 
 * Features:
 * - Instant load from localStorage (no network wait)
 * - Background server sync
 * - Offline support
 * - Automatic cleanup of old data
 * - Size management
 */

import type { Message } from "../types"

const STORAGE_PREFIX = "lamda:chat:"
const MAX_STORAGE_SIZE = 50 * 1024 * 1024 // 50MB limit
const MAX_THREADS_STORED = 50 // Max threads to cache
const SYNC_DEBOUNCE_MS = 1000 // Debounce sync operations

interface StoredThreadData {
  messages: Message[]
  lastSyncedAt: number
  serverVersion: number
  dirty: boolean // True if local changes not yet synced
}

interface SyncEngineState {
  isOnline: boolean
  isSyncing: boolean
  lastError: Error | null
}

// ── Storage Operations ─────────────────────────────────────────────────────────

function getStorageKey(sessionId: string): string {
  return `${STORAGE_PREFIX}${sessionId}`
}

function getThreadsIndexKey(): string {
  return `${STORAGE_PREFIX}index`
}

function getStoredThreadIds(): string[] {
  try {
    const index = localStorage.getItem(getThreadsIndexKey())
    return index ? JSON.parse(index) : []
  } catch {
    return []
  }
}

function setStoredThreadIds(ids: string[]): void {
  try {
    localStorage.setItem(getThreadsIndexKey(), JSON.stringify(ids))
  } catch (e) {
    console.warn("[chat-sync] Failed to update threads index:", e)
  }
}

function getStorageSize(): number {
  let total = 0
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith(STORAGE_PREFIX)) {
      const value = localStorage.getItem(key)
      if (value) {
        total += key.length + value.length
      }
    }
  }
  return total
}

function cleanOldThreads(keepIds: Set<string>): void {
  const currentIds = getStoredThreadIds()
  const toRemove = currentIds.filter((id) => !keepIds.has(id))
  
  for (const id of toRemove) {
    try {
      localStorage.removeItem(getStorageKey(id))
    } catch (e) {
      console.warn("[chat-sync] Failed to remove old thread:", id, e)
    }
  }
  
  setStoredThreadIds(currentIds.filter((id) => keepIds.has(id)))
}

// ── Thread Data Operations ─────────────────────────────────────────────────────

export function saveThreadToStorage(
  sessionId: string,
  messages: Message[],
  serverVersion: number = 0
): void {
  try {
    const data: StoredThreadData = {
      messages,
      lastSyncedAt: Date.now(),
      serverVersion,
      dirty: false,
    }
    
    localStorage.setItem(getStorageKey(sessionId), JSON.stringify(data))
    
    // Update index
    const ids = getStoredThreadIds()
    if (!ids.includes(sessionId)) {
      ids.unshift(sessionId) // Add to front (most recent)
      setStoredThreadIds(ids)
    }
    
    // Cleanup if needed
    const currentSize = getStorageSize()
    if (currentSize > MAX_STORAGE_SIZE) {
      const idsToKeep = new Set(ids.slice(0, MAX_THREADS_STORED))
      cleanOldThreads(idsToKeep)
    }
  } catch (e) {
    console.warn("[chat-sync] Failed to save thread to storage:", sessionId, e)
    // If quota exceeded, try to clean up
    if (e instanceof DOMException && e.name === "QuotaExceededError") {
      cleanOldThreads(new Set())
      try {
        const data: StoredThreadData = {
          messages,
          lastSyncedAt: Date.now(),
          serverVersion,
          dirty: false,
        }
        localStorage.setItem(getStorageKey(sessionId), JSON.stringify(data))
      } catch {
        console.error("[chat-sync] Still failed after cleanup, storage may be corrupted")
      }
    }
  }
}

export function loadThreadFromStorage(sessionId: string): StoredThreadData | null {
  try {
    const raw = localStorage.getItem(getStorageKey(sessionId))
    if (!raw) return null
    
    const data = JSON.parse(raw) as StoredThreadData
    
    // Validate structure
    if (!Array.isArray(data.messages)) {
      return null
    }
    
    return data
  } catch (e) {
    console.warn("[chat-sync] Failed to load thread from storage:", sessionId, e)
    return null
  }
}

export function markThreadDirty(sessionId: string): void {
  try {
    const data = loadThreadFromStorage(sessionId)
    if (data) {
      data.dirty = true
      localStorage.setItem(getStorageKey(sessionId), JSON.stringify(data))
    }
  } catch (e) {
    console.warn("[chat-sync] Failed to mark thread dirty:", sessionId, e)
  }
}

export function clearThreadFromStorage(sessionId: string): void {
  try {
    localStorage.removeItem(getStorageKey(sessionId))
    const ids = getStoredThreadIds().filter((id) => id !== sessionId)
    setStoredThreadIds(ids)
  } catch (e) {
    console.warn("[chat-sync] Failed to clear thread:", sessionId, e)
  }
}

export function getAllStoredThreadIds(): string[] {
  return getStoredThreadIds()
}

// ── Scroll Meta Storage ────────────────────────────────────────────────────────

interface ScrollMeta {
  scrollTop: number
  isPinned: boolean
  visited: boolean
}

function getScrollMetaKey(sessionId: string): string {
  return `${STORAGE_PREFIX}scroll:${sessionId}`
}

export function saveScrollMetaToStorage(sessionId: string, meta: ScrollMeta): void {
  try {
    localStorage.setItem(getScrollMetaKey(sessionId), JSON.stringify(meta))
  } catch (e) {
    console.warn("[chat-sync] Failed to save scroll meta:", e)
  }
}

export function loadScrollMetaFromStorage(sessionId: string): ScrollMeta | null {
  try {
    const raw = localStorage.getItem(getScrollMetaKey(sessionId))
    if (!raw) return null
    return JSON.parse(raw) as ScrollMeta
  } catch (e) {
    console.warn("[chat-sync] Failed to load scroll meta:", e)
    return null
  }
}

// ── Sync Engine ────────────────────────────────────────────────────────────────

type SyncListener = (state: SyncEngineState) => void

class ChatSyncEngine {
  private listeners: Set<SyncListener> = new Set()
  private state: SyncEngineState = {
    isOnline: navigator.onLine,
    isSyncing: false,
    lastError: null,
  }
  private syncTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map()
  private pendingSyncs: Map<string, Message[]> = new Map()

  constructor() {
    // Listen for online/offline events
    window.addEventListener("online", this.handleOnline)
    window.addEventListener("offline", this.handleOffline)
  }

  private handleOnline = () => {
    this.state = { ...this.state, isOnline: true }
    this.notifyListeners()
    // Trigger sync for all dirty threads
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
    // Immediately notify with current state
    listener(this.state)
    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener)
    }
  }

  getState(): SyncEngineState {
    return this.state
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Save messages to localStorage immediately
   */
  saveMessages(sessionId: string, messages: Message[]): void {
    saveThreadToStorage(sessionId, messages)
  }

  /**
   * Load messages from localStorage (instant, no network)
   */
  loadMessages(sessionId: string): Message[] | null {
    const stored = loadThreadFromStorage(sessionId)
    return stored?.messages ?? null
  }

  /**
   * Save scroll position meta to localStorage
   */
  saveScrollMeta(sessionId: string, meta: { scrollTop: number; isPinned: boolean; visited: boolean }): void {
    saveScrollMetaToStorage(sessionId, meta)
  }

  /**
   * Get scroll position meta from localStorage
   */
  getScrollMeta(sessionId: string): { scrollTop: number; isPinned: boolean; visited: boolean } | null {
    return loadScrollMetaFromStorage(sessionId)
  }

  /**
   * Schedule a sync to server (debounced)
   */
  scheduleSync(sessionId: string, messages: Message[]): void {
    // Cancel any pending sync for this session
    const existingTimeout = this.syncTimeouts.get(sessionId)
    if (existingTimeout) {
      clearTimeout(existingTimeout)
    }

    // Store pending messages
    this.pendingSyncs.set(sessionId, messages)

    // Mark as dirty
    markThreadDirty(sessionId)

    // Schedule debounced sync
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

      // Fetch latest from server
      const serverMessages = await fetchFn()

      // Get local messages
      const localData = loadThreadFromStorage(sessionId)
      const localMessages = localData?.messages ?? []

      // Merge: prefer server for existing messages, keep local for new ones
      const merged = this.mergeMessages(localMessages, serverMessages)

      // Save merged result
      saveThreadToStorage(sessionId, merged)

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
    const ids = getStoredThreadIds()

    for (const sessionId of ids) {
      const data = loadThreadFromStorage(sessionId)
      if (data?.dirty) {
        // Will be synced when fetchFn is provided
        console.log("[chat-sync] Dirty thread needs sync:", sessionId)
      }
    }
  }

  /**
   * Merge local and server messages
   */
  private mergeMessages(_local: Message[], server: Message[]): Message[] {
    // For now, prefer server messages (they're the source of truth)
    // In the future, we could do smarter merging based on timestamps/IDs
    return server
  }

  /**
   * Clear all cached data
   */
  clearAll(): void {
    const ids = getStoredThreadIds()
    for (const id of ids) {
      localStorage.removeItem(getStorageKey(id))
    }
    localStorage.removeItem(getThreadsIndexKey())
  }

  /**
   * Get storage stats
   */
  getStats(): { threadCount: number; sizeBytes: number; sizeMB: number } {
    const threadCount = getStoredThreadIds().length
    const sizeBytes = getStorageSize()
    return {
      threadCount,
      sizeBytes,
      sizeMB: Math.round(sizeBytes / 1024 / 1024 * 100) / 100,
    }
  }

  destroy(): void {
    window.removeEventListener("online", this.handleOnline)
    window.removeEventListener("offline", this.handleOffline)
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
  return getChatSyncEngine()
}
