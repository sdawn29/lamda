import { useQuery, useInfiniteQuery } from "@tanstack/react-query"
import type { InfiniteData } from "@tanstack/react-query"
import {
  listMessages,
  fetchModels,
  fetchSlashCommands,
  fetchContextUsage,
  fetchThinkingLevels,
  fetchSessionStats,
  fetchSessionStatus,
} from "./api"
import { blocksToMessages, type MessageBlock, type Message, type ToolMessage } from "./types"
import {
  getChatSyncEngine,
  loadThreadFromStorage,
} from "./hooks/use-chat-sync-engine"

export type { WorkspaceEntry } from "./api"

const chatRootKey = ["chat"] as const
const chatSessionKey = (sessionId: string) =>
  [...chatRootKey, "session", sessionId] as const

export const chatKeys = {
  all: chatRootKey,
  session: chatSessionKey,
  messages: (sessionId: string) =>
    [...chatSessionKey(sessionId), "messages"] as const,
  models: [...chatRootKey, "models"] as const,
  commands: (sessionId: string) =>
    [...chatSessionKey(sessionId), "commands"] as const,
  contextUsage: (sessionId: string) =>
    [...chatSessionKey(sessionId), "context-usage"] as const,
  sessionStats: (sessionId: string) =>
    [...chatSessionKey(sessionId), "stats"] as const,
  thinkingLevels: (sessionId: string) =>
    [...chatSessionKey(sessionId), "thinking-levels"] as const,
  status: (sessionId: string) =>
    [...chatSessionKey(sessionId), "status"] as const,
  scroll: (sessionId: string) =>
    [...chatSessionKey(sessionId), "meta", "scroll"] as const,
  errors: (sessionId: string) =>
    [...chatSessionKey(sessionId), "meta", "errors"] as const,
  pendingError: (sessionId: string) =>
    [...chatSessionKey(sessionId), "meta", "pendingError"] as const,
}

// ── Messages ─────────────────────────────────────────────────────────────────

export const MESSAGES_PAGE_SIZE = 50

export const messagesQueryKey = (sessionId: string) =>
  chatKeys.messages(sessionId)

export interface MessagesPage {
  messages: Message[]
  hasMore: boolean
  /** blockIndex of the oldest block in this page — used as cursor for the previous page */
  oldestBlockIndex: number | null
}

export type MessagesInfiniteData = InfiniteData<MessagesPage, number | undefined>

/** Apply a transform to only the last (most-recent) page in the infinite cache. */
export function updateLastPageMessages(
  data: MessagesInfiniteData | undefined,
  updater: (msgs: Message[]) => Message[]
): MessagesInfiniteData | undefined {
  if (!data) return data
  const { pages, pageParams } = data
  const last = pages[pages.length - 1]
  return {
    pages: [...pages.slice(0, -1), { ...last, messages: updater(last.messages) }],
    pageParams,
  }
}

/** Flatten all pages into a single chronological message list.
 *
 * Tool messages are deduplicated by toolCallId, keeping the LAST occurrence.
 * This guards against the multi-page edge case where `upsertToolMessage` (which
 * only operates on the last page) misses a same-ID entry in an older page and
 * inserts a second copy, causing React key collisions in WorkingBlock.
 */
export function getMessagesFromInfinite(data: MessagesInfiniteData | undefined): Message[] {
  if (!data) return []
  const flat = data.pages.flatMap((p) => p.messages)

  // Fast path: no pages or a single page (the common case during streaming).
  if (data.pages.length <= 1) return flat

  // Build a map of toolCallId → last index so we can filter out earlier dupes.
  const toolLastIndex = new Map<string, number>()
  for (let i = 0; i < flat.length; i++) {
    const m = flat[i]
    if (m.role === "tool") toolLastIndex.set((m as ToolMessage).toolCallId, i)
  }

  // If every tool call id is unique there's nothing to filter.
  const hasDupes = flat.some(
    (m, i) => m.role === "tool" && toolLastIndex.get((m as ToolMessage).toolCallId) !== i
  )
  if (!hasDupes) return flat

  return flat.filter((m, i) => {
    if (m.role !== "tool") return true
    // Keep only the last (most up-to-date) entry for each toolCallId.
    return toolLastIndex.get((m as ToolMessage).toolCallId) === i
  })
}

export function useInfiniteMessages(sessionId: string) {
  const syncEngine = getChatSyncEngine()

  return useInfiniteQuery<
    MessagesPage,
    Error,
    MessagesInfiniteData,
    ReturnType<typeof messagesQueryKey>,
    number | undefined
  >({
    queryKey: messagesQueryKey(sessionId),
    queryFn: async ({ pageParam }): Promise<MessagesPage> => {
      const { blocks, hasMore } = await listMessages(sessionId, {
        limit: MESSAGES_PAGE_SIZE,
        before: pageParam,
      })
      const messages = blocksToMessages(blocks as MessageBlock[])
      const oldestBlockIndex = blocks.length > 0 ? (blocks[0] as MessageBlock).blockIndex : null
      // Persist the first (most-recent) page so the next thread switch is instant.
      if (pageParam === undefined) {
        syncEngine.saveMessages(sessionId, messages)
      }
      return { messages, hasMore, oldestBlockIndex }
    },
    initialPageParam: undefined,
    // Older pages are loaded when the user scrolls up.
    getPreviousPageParam: (firstPage) =>
      firstPage.hasMore && firstPage.oldestBlockIndex !== null
        ? firstPage.oldestBlockIndex
        : undefined,
    getNextPageParam: () => undefined, // WS stream handles new messages
    // Always return a valid InfiniteData — never undefined.
    // When initialData returns undefined, TQ v5 creates { pages: undefined, pageParams: undefined }
    // which causes getNextPageParam to crash on pages.length.
    initialData: (): MessagesInfiniteData => {
      const stored = loadThreadFromStorage(sessionId)
      const storedMsgs = stored?.messages ?? []
      const msgs = storedMsgs.slice(-MESSAGES_PAGE_SIZE)
      return {
        pages: [{ messages: msgs, hasMore: storedMsgs.length > MESSAGES_PAGE_SIZE, oldestBlockIndex: null }],
        pageParams: [undefined],
      }
    },
    gcTime: 30 * 60 * 1000,
    staleTime: 5 * 60 * 1000,
    // Default mount behavior respects staleTime — paired with the WS stream
    // delivering live deltas, this avoids a redundant full-page fetch on every
    // thread switch (and avoids racing the optimistic message + WS state).
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    enabled: !!sessionId,
  })
}

// ── Models ─────────────────────────────────────────────────────────────────

export const modelsQueryKey = chatKeys.models

export function useModels() {
  return useQuery({
    queryKey: modelsQueryKey,
    queryFn: ({ signal }) => fetchModels(signal),
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}

// ── Slash commands ────────────────────────────────────────────────────────

export function useSlashCommands(
  sessionId: string | undefined,
  enabled = true
) {
  return useQuery({
    queryKey: sessionId ? chatKeys.commands(sessionId) : chatKeys.all,
    queryFn: () => fetchSlashCommands(sessionId!),
    enabled: enabled && !!sessionId,
    gcTime: 60 * 1000,
    staleTime: 0,
  })
}

// ── Thinking levels ────────────────────────────────────────────────────────

export function useThinkingLevels(sessionId: string | undefined) {
  return useQuery({
    queryKey: sessionId ? chatKeys.thinkingLevels(sessionId) : chatKeys.all,
    queryFn: () => fetchThinkingLevels(sessionId!),
    enabled: !!sessionId,
    staleTime: 5_000,
    select: (data) => data.levels,
  })
}

// ── Context usage ─────────────────────────────────────────────────────────

export function useContextUsage(sessionId: string | undefined) {
  return useQuery({
    queryKey: sessionId ? chatKeys.contextUsage(sessionId) : chatKeys.all,
    queryFn: () => fetchContextUsage(sessionId!),
    enabled: !!sessionId,
    gcTime: 30 * 1000,
    staleTime: 30_000,
    select: (data) => data.contextUsage,
  })
}

// ── Session stats ─────────────────────────────────────────────────────────

export function useSessionStats(sessionId: string | undefined) {
  return useQuery({
    queryKey: sessionId ? chatKeys.sessionStats(sessionId) : chatKeys.all,
    queryFn: () => fetchSessionStats(sessionId!),
    enabled: !!sessionId,
    gcTime: 30 * 1000,
    staleTime: 30_000,
    select: (data) => data.stats,
  })
}

// ── Session status ─────────────────────────────────────────────────────────
//
// Fetches a snapshot of transient session state (isRunning, isCompacting,
// pendingError) on every thread mount. Replaces event-replay as the mechanism
// for restoring UI state when switching threads.

export function useSessionStatus(sessionId: string | undefined) {
  return useQuery({
    queryKey: sessionId ? chatKeys.status(sessionId) : chatKeys.all,
    queryFn: () => fetchSessionStatus(sessionId!),
    enabled: !!sessionId,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  })
}
