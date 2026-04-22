import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  listMessages,
  fetchModels,
  listWorkspaceFiles,
  fetchSlashCommands,
  fetchContextUsage,
  fetchThinkingLevels,
} from "./api"
import { createAssistantMessage, parseAssistantMessageContent, type StoredMessageDto } from "./types"
import type { Message } from "./types"
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
  thinkingLevels: (sessionId: string) =>
    [...chatSessionKey(sessionId), "thinking-levels"] as const,
  // Meta keys for streaming state (replaces module-level Maps)
  scroll: (sessionId: string) =>
    [...chatSessionKey(sessionId), "meta", "scroll"] as const,
  errors: (sessionId: string) =>
    [...chatSessionKey(sessionId), "meta", "errors"] as const,
  pendingError: (sessionId: string) =>
    [...chatSessionKey(sessionId), "meta", "pendingError"] as const,
}

// ── Messages ──────────────────────────────────────────────────────────────────

export function storedToMessage(m: StoredMessageDto): Message {
  if (m.role === "tool") {
    const data = JSON.parse(m.content) as {
      toolCallId: string
      toolName: string
      args: unknown
      result: unknown
      status: "running" | "done" | "error"
      startTime?: number
      duration?: number
    }
    return {
      role: "tool",
      toolCallId: data.toolCallId,
      toolName: data.toolName,
      args: data.args,
      result: data.result,
      status: data.status,
      startTime: data.startTime,
      duration: data.duration,
    }
  }
  if (m.role === "assistant") {
    return {
      ...createAssistantMessage(parseAssistantMessageContent(m.content)),
      createdAt: m.createdAt,
    }
  }
  return { role: "user", content: m.content, createdAt: m.createdAt }
}

export const messagesQueryKey = (sessionId: string) =>
  chatKeys.messages(sessionId)

export function useMessages(sessionId: string) {
  const queryClient = useQueryClient()
  const syncEngine = getChatSyncEngine()

  return useQuery({
    queryKey: messagesQueryKey(sessionId),
    queryFn: async (): Promise<Message[]> => {
      // Fetch from server
      const { messages: stored } = await listMessages(sessionId)
      const serverMessages = stored.map(storedToMessage)

      // Save to localStorage for next time
      syncEngine.saveMessages(sessionId, serverMessages)

      // Update query cache with server data
      queryClient.setQueryData(messagesQueryKey(sessionId), serverMessages)

      return serverMessages
    },
    // Load initial data from localStorage immediately (no network)
    initialData: () => {
      const localData = loadThreadFromStorage(sessionId)
      return localData?.messages ?? undefined
    },
    // Keep messages cached for a long time
    gcTime: 30 * 60 * 1000, // 30 minutes
    staleTime: 30 * 60 * 1000, // 30 minutes
    refetchOnMount: false, // Use cached data
    refetchOnWindowFocus: false, // Don't refetch on window focus
    enabled: !!sessionId,
  })
}

// ── Models ────────────────────────────────────────────────────────────────────

export const modelsQueryKey = chatKeys.models

export function useModels() {
  return useQuery({
    queryKey: modelsQueryKey,
    queryFn: ({ signal }) => fetchModels(signal),
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}

// ── Workspace files ───────────────────────────────────────────────────────────

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

// ── Slash commands ────────────────────────────────────────────────────────────

export function useSlashCommands(
  sessionId: string | undefined,
  enabled = true
) {
  return useQuery({
    queryKey: sessionId ? chatKeys.commands(sessionId) : chatKeys.all,
    queryFn: () => fetchSlashCommands(sessionId!),
    enabled: enabled && !!sessionId,
    gcTime: 60 * 1000,
    // staleTime: 0 ensures that every time the slash-command dropdown opens
    // (enabled flips true) TanStack Query will immediately consider the cached
    // data stale and issue a fresh network request to pick up any newly-added
    // skills or prompt templates.
    staleTime: 0,
  })
}

// ── Thinking levels ───────────────────────────────────────────────────────────

export function useThinkingLevels(sessionId: string | undefined) {
  return useQuery({
    queryKey: sessionId ? chatKeys.thinkingLevels(sessionId) : chatKeys.all,
    queryFn: () => fetchThinkingLevels(sessionId!),
    enabled: !!sessionId,
    staleTime: 5_000,
    select: (data) => data.levels,
  })
}

// ── Context usage ─────────────────────────────────────────────────────────────

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
