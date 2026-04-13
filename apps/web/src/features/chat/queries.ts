import { useQuery } from "@tanstack/react-query"
import {
  listMessages,
  fetchModels,
  listWorkspaceFiles,
  fetchSlashCommands,
  fetchContextUsage,
} from "./api"
import {
  createAssistantMessage,
  parseAssistantMessageContent,
  type StoredMessageDto,
  type Message,
} from "./types"

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
}

// ── Messages ──────────────────────────────────────────────────────────────────

function storedToMessage(m: StoredMessageDto): Message {
  if (m.role === "tool") {
    const data = JSON.parse(m.content) as {
      toolCallId: string
      toolName: string
      args: unknown
      result: unknown
      status: "running" | "done" | "error"
    }
    return {
      role: "tool",
      toolCallId: data.toolCallId,
      toolName: data.toolName,
      args: data.args,
      result: data.result,
      status: data.status,
    }
  }
  if (m.role === "assistant") {
    return createAssistantMessage(parseAssistantMessageContent(m.content))
  }
  return { role: "user", content: m.content }
}

export const messagesQueryKey = (sessionId: string) =>
  chatKeys.messages(sessionId)

export function useMessages(sessionId: string) {
  return useQuery({
    queryKey: messagesQueryKey(sessionId),
    queryFn: async () => {
      const { messages: stored } = await listMessages(sessionId)
      return stored.map(storedToMessage)
    },
    gcTime: 60 * 1000,
    staleTime: 5 * 60 * 1000,
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
    staleTime: 5 * 60 * 1000,
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
