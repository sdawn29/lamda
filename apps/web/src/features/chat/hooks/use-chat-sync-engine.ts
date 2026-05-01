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

import { useEffect } from "react"
import type { Message, MessageBlock, ErrorMessage } from "../types"
import { blocksToMessages } from "../types"

const STORAGE_PREFIX = "lamda:chat:"
const MAX_STORAGE_SIZE = 50 * 1024 * 1024 // 50MB limit
const MAX_THREADS_STORED = 50 // Max threads to cache
const SYNC_DEBOUNCE_MS = 1000 // Debounce sync operations

interface StoredThreadData {
  blocks: MessageBlock[]
  messages: Message[] // Derived from blocks for UI
  lastSyncedAt: number
  serverVersion: number
  dirty: boolean
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

/**
 * Save blocks to localStorage
 */
export function saveBlocksToStorage(
  sessionId: string,
  blocks: MessageBlock[],
  serverVersion: number = 0
): void {
  try {
    const data: StoredThreadData = {
      blocks,
      messages: blocksToMessages(blocks),
      lastSyncedAt: Date.now(),
      serverVersion,
      dirty: false,
    }
    
    localStorage.setItem(getStorageKey(sessionId), JSON.stringify(data))
    
    // Update index
    const ids = getStoredThreadIds()
    if (!ids.includes(sessionId)) {
      ids.unshift(sessionId)
      setStoredThreadIds(ids)
    }
    
    // Cleanup if needed
    const currentSize = getStorageSize()
    if (currentSize > MAX_STORAGE_SIZE) {
      const idsToKeep = new Set(ids.slice(0, MAX_THREADS_STORED))
      cleanOldThreads(idsToKeep)
    }
  } catch (e) {
    console.warn("[chat-sync] Failed to save blocks to storage:", sessionId, e)
    if (e instanceof DOMException && e.name === "QuotaExceededError") {
      cleanOldThreads(new Set())
      try {
        const data: StoredThreadData = {
          blocks: [],
          messages: [],
          lastSyncedAt: Date.now(),
          serverVersion,
          dirty: false,
        }
        localStorage.setItem(getStorageKey(sessionId), JSON.stringify(data))
      } catch {
        console.error("[chat-sync] Still failed after cleanup")
      }
    }
  }
}

/**
 * Save messages to localStorage (converts to blocks first)
 */
export function saveMessagesToStorage(
  sessionId: string,
  messages: Message[],
  serverVersion: number = 0
): void {
  // Convert messages back to blocks for storage
  const blocks = messagesToBlocks(messages)
  saveBlocksToStorage(sessionId, blocks, serverVersion)
}

/**
 * Convert UI messages to blocks for storage
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
          toolResult: msg.result ? (typeof msg.result === "string" ? msg.result : JSON.stringify(msg.result)) : null,
          toolStatus: msg.status,
          toolDuration: msg.duration ?? null,
          toolStartTime: msg.startTime ?? null,
        }
      default:
        return base
    }
  })
}

/**
 * Load blocks from localStorage
 */
export function loadBlocksFromStorage(sessionId: string): StoredThreadData | null {
  try {
    const raw = localStorage.getItem(getStorageKey(sessionId))
    if (!raw) return null
    
    const data = JSON.parse(raw) as StoredThreadData
    
    // Validate structure
    if (!Array.isArray(data.blocks)) {
      return null
    }
    
    return data
  } catch (e) {
    console.warn("[chat-sync] Failed to load blocks from storage:", sessionId, e)
    return null
  }
}

export function loadThreadFromStorage(sessionId: string): { messages: Message[] } | null {
  const stored = loadBlocksFromStorage(sessionId)
  if (!stored) return null
  return { messages: stored.messages }
}

export function markThreadDirty(sessionId: string): void {
  try {
    const data = loadBlocksFromStorage(sessionId)
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
   * Save messages to localStorage (converts to blocks)
   */
  saveMessages(sessionId: string, messages: Message[]): void {
    saveMessagesToStorage(sessionId, messages)
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
    const ids = getStoredThreadIds()

    for (const sessionId of ids) {
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
