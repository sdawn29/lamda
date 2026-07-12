import { useQuery, useInfiniteQuery } from "@tanstack/react-query"
import type { InfiniteData } from "@tanstack/react-query"
import {
  listMessages,
  fetchModels,
  fetchSlashCommands,
  fetchWorkspaceCommands,
  fetchContextUsage,
  fetchThinkingLevels,
  fetchSessionStats,
  fetchSessionStatus,
  listCheckpoints,
} from "./api"
import {
  blocksToMessages,
  type MessageBlock,
  type Message,
  type ToolMessage,
} from "./types"
import { appendToken, getServerUrl } from "@/shared/lib/client"
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
  workspaceCommands: (workspaceId: string) =>
    [...chatRootKey, "workspace", workspaceId, "commands"] as const,
  contextUsage: (sessionId: string) =>
    [...chatSessionKey(sessionId), "context-usage"] as const,
  sessionStats: (sessionId: string) =>
    [...chatSessionKey(sessionId), "stats"] as const,
  thinkingLevels: (sessionId: string) =>
    [...chatSessionKey(sessionId), "thinking-levels"] as const,
  status: (sessionId: string) =>
    [...chatSessionKey(sessionId), "status"] as const,
  // Keyed by threadId (not sessionId): checkpoints are durable per-thread
  // rows, unlike the rest of this feature which keys off the live session.
  checkpoints: (threadId: string) =>
    [...chatRootKey, "thread", threadId, "checkpoints"] as const,
}

// ── Messages ─────────────────────────────────────────────────────────────────

export const MESSAGES_PAGE_SIZE = 100

export const messagesQueryKey = (sessionId: string) =>
  chatKeys.messages(sessionId)

export interface MessagesPage {
  messages: Message[]
  hasMore: boolean
  /** blockIndex of the oldest block in this page — used as cursor for the previous page */
  oldestBlockIndex: number | null
}

export type MessagesInfiniteData = InfiniteData<
  MessagesPage,
  number | undefined
>

/** Apply a transform to only the last (most-recent) page in the infinite cache. */
export function updateLastPageMessages(
  data: MessagesInfiniteData | undefined,
  updater: (msgs: Message[]) => Message[]
): MessagesInfiniteData | undefined {
  if (!data) return data
  const { pages, pageParams } = data
  const last = pages[pages.length - 1]
  return {
    pages: [
      ...pages.slice(0, -1),
      { ...last, messages: updater(last.messages) },
    ],
    pageParams,
  }
}

/** Flatten all pages into a single chronological message list.
 *
 * Tool messages are deduplicated by toolCallId, keeping the LAST occurrence.
 * Duplicates show up two ways: the multi-page edge case where
 * `upsertToolMessage` (which only operates on the last page) misses a same-ID
 * entry in an older page and inserts a second copy, and threads whose
 * persisted blocks already contain duplicate tool rows. Both cause React key
 * collisions in WorkingBlock, so dedup runs even for a single page.
 */
export function getMessagesFromInfinite(
  data: MessagesInfiniteData | undefined
): Message[] {
  if (!data) return []
  const flat = data.pages.flatMap((p) => p.messages)

  // Build a map of toolCallId → last index so we can filter out earlier dupes.
  const toolLastIndex = new Map<string, number>()
  for (let i = 0; i < flat.length; i++) {
    const m = flat[i]
    if (m.role === "tool") toolLastIndex.set((m as ToolMessage).toolCallId, i)
  }

  // If every tool call id is unique there's nothing to filter.
  const hasDupes = flat.some(
    (m, i) =>
      m.role === "tool" &&
      toolLastIndex.get((m as ToolMessage).toolCallId) !== i
  )
  if (!hasDupes) return flat

  return flat.filter((m, i) => {
    if (m.role !== "tool") return true
    // Keep only the last (most up-to-date) entry for each toolCallId.
    return toolLastIndex.get((m as ToolMessage).toolCallId) === i
  })
}

export function useInfiniteMessages(sessionId: string) {
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
      const oldestBlockIndex =
        blocks.length > 0 ? (blocks[0] as MessageBlock).blockIndex : null

      return { messages, hasMore, oldestBlockIndex }
    },
    initialPageParam: undefined,
    // Older pages are loaded when the user scrolls up.
    getPreviousPageParam: (firstPage) =>
      firstPage.hasMore && firstPage.oldestBlockIndex !== null
        ? firstPage.oldestBlockIndex
        : undefined,
    getNextPageParam: () => undefined, // WS stream handles new messages
    // Guarantee the cache always holds a page structure from first mount.
    // Every transcript writer (optimistic user append, WS stream deltas,
    // reconnect replay) patches the last page via updateLastPageMessages,
    // which bails out on `undefined` — without this seed, writes that land
    // while the initial fetch is still in flight would be silently dropped.
    // initialDataUpdatedAt: 0 marks the empty seed already-stale so the mount
    // refetch fires immediately instead of serving it for `staleTime`.
    initialData: (): MessagesInfiniteData => ({
      pages: [{ messages: [], hasMore: false, oldestBlockIndex: null }],
      pageParams: [undefined],
    }),
    initialDataUpdatedAt: 0,
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

// Slash commands resolved for a workspace without a session — used by the
// new-thread composer, which has no session until the first prompt is sent.
export function useWorkspaceSlashCommands(
  workspaceId: string | undefined,
  enabled = true
) {
  return useQuery({
    queryKey: workspaceId
      ? chatKeys.workspaceCommands(workspaceId)
      : chatKeys.all,
    queryFn: () => fetchWorkspaceCommands(workspaceId!),
    enabled: enabled && !!workspaceId,
    gcTime: 60 * 1000,
    // Resolving these rebuilds the workspace's resource loader server-side, so
    // (unlike the cheap session read) reuse a recent result across re-opens.
    staleTime: 30 * 1000,
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

// ── Checkpoints ───────────────────────────────────────────────────────────

export function useThreadCheckpoints(threadId: string | undefined) {
  return useQuery({
    queryKey: threadId ? chatKeys.checkpoints(threadId) : chatKeys.all,
    queryFn: () => listCheckpoints(threadId!),
    enabled: !!threadId,
    staleTime: 10_000,
  })
}

// ── File peek (hover preview on file chips) ────────────────────────────────

export interface FilePeek {
  content: string
  notFound: boolean
}

// Uses the raw /file endpoint (not apiFetch, which assumes JSON) — same
// fetch+appendToken pattern as the main-tabs file viewer. Any non-2xx or
// network failure collapses into `notFound: true` since the chip only needs
// a binary found/not-found signal, not the distinction between a 403 (outside
// workspace) and a 500 (stat() ENOENT).
async function fetchFilePeek(path: string): Promise<FilePeek> {
  const serverUrl = await getServerUrl()
  let response: Response
  try {
    response = await fetch(
      appendToken(`${serverUrl}/file?path=${encodeURIComponent(path)}`)
    )
  } catch {
    return { content: "", notFound: true }
  }
  if (!response.ok) return { content: "", notFound: true }
  const content = await response.text()
  return { content, notFound: false }
}

export const filePeekKey = (path: string) =>
  [...chatRootKey, "file-peek", path] as const

/**
 * Lazily fetches a file's content for the hover-peek shown in a file chip's
 * tooltip. Callers pass `enabled: false` until the tooltip has opened once,
 * then keep it `true` — the long staleTime means later hovers of the same
 * chip (or repeat mentions of the same file) are served from cache instead
 * of refetching on every hover.
 */
export function useFilePeek(path: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: filePeekKey(path ?? ""),
    queryFn: () => fetchFilePeek(path!),
    enabled: enabled && !!path,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: false,
  })
}
