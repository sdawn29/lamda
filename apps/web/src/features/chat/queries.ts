import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  listMessages,
  fetchModels,
  listWorkspaceFiles,
  fetchSlashCommands,
  fetchContextUsage,
  fetchThinkingLevels,
  fetchSessionStats,
} from "./api"
import { blocksToMessages, type MessageBlock, type Message } from "./types"
import { getChatSyncEngine, loadThreadFromStorage } from "./hooks/use-chat-sync-engine"

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
  workspaceFiles: (sessionId: string) =>
    [...chatSessionKey(sessionId), "workspace-files"] as const,
  commands: (sessionId: string) =>
    [...chatSessionKey(sessionId), "commands"] as const,
  contextUsage: (sessionId: string) =>
    [...chatSessionKey(sessionId), "context-usage"] as const,
  sessionStats: (sessionId: string) =>
    [...chatSessionKey(sessionId), "stats"] as const,
  thinkingLevels: (sessionId: string) =>
    [...chatSessionKey(sessionId), "thinking-levels"] as const,
  scroll: (sessionId: string) =>
    [...chatSessionKey(sessionId), "meta", "scroll"] as const,
  errors: (sessionId: string) =>
    [...chatSessionKey(sessionId), "meta", "errors"] as const,
  pendingError: (sessionId: string) =>
    [...chatSessionKey(sessionId), "meta", "pendingError"] as const,
}

// ── Messages ─────────────────────────────────────────────────────────────────

export const messagesQueryKey = (sessionId: string) =>
  chatKeys.messages(sessionId)

/**
 * Fetch messages from server and convert blocks to UI messages.
 * Uses the new block-based message storage.
 */
export function useMessages(sessionId: string) {
  const queryClient = useQueryClient()
  const syncEngine = getChatSyncEngine()

  return useQuery({
    queryKey: messagesQueryKey(sessionId),
    queryFn: async (): Promise<Message[]> => {
      // Fetch blocks from server
      const { blocks } = await listMessages(sessionId)
      
      // Convert blocks to UI messages
      const serverMessages = blocksToMessages(blocks as MessageBlock[])

      // Save to localStorage for instant loading
      syncEngine.saveMessages(sessionId, serverMessages)

      // Update query cache
      queryClient.setQueryData(messagesQueryKey(sessionId), serverMessages)

      return serverMessages
    },
    // Load from localStorage first (instant, no network)
    initialData: () => {
      const stored = loadThreadFromStorage(sessionId)
      return stored?.messages ?? undefined
    },
    gcTime: 30 * 60 * 1000,
    staleTime: 30 * 60 * 1000,
    refetchOnMount: false,
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

// ── Workspace files ─────────────────────────────────────────────────────────

export const workspaceFilesQueryKey = (sessionId: string) =>
  chatKeys.workspaceFiles(sessionId)

export function useWorkspaceFiles(
  sessionId: string | undefined,
  enabled = true
) {
  return useQuery({
    queryKey: sessionId ? workspaceFilesQueryKey(sessionId) : chatKeys.all,
    queryFn: () => listWorkspaceFiles(sessionId!),
    enabled: enabled && !!sessionId,
    gcTime: 60 * 1000,
    staleTime: 30_000,
    select: (data) => data,
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
    refetchInterval: () =>
      typeof document === "undefined" || document.visibilityState !== "visible"
        ? false
        : 3_000,
    refetchIntervalInBackground: false,
    staleTime: 0,
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
    refetchInterval: () =>
      typeof document === "undefined" || document.visibilityState !== "visible"
        ? false
        : 5_000,
    refetchIntervalInBackground: false,
    staleTime: 0,
    select: (data) => data.stats,
  })
}
