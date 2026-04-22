import { apiFetch, getServerUrl } from "@/shared/lib/client"
import type { MessageBlock, StoredMessageDto } from "./types"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ImageContent {
  type: "image"
  source: {
    type: "base64" | "url"
    mediaType?: string
    data: string
    url?: string
  }
}

export interface PromptOptions {
  images?: ImageContent[]
  streamingBehavior?: "steer" | "followUp"
  expandPromptTemplates?: boolean
}

// ── Session ────────────────────────────────────────────────────────────────────

export interface CreateSessionBody {
  anthropicApiKey?: string
  cwd?: string
  provider?: string
  model?: string
}

export interface CreateSessionResponse {
  sessionId: string
}

export interface SendPromptResponse {
  accepted: boolean
}

export function createSession(
  body: CreateSessionBody = {}
): Promise<CreateSessionResponse> {
  return apiFetch<CreateSessionResponse>("/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

export function deleteSession(id: string): Promise<void> {
  return apiFetch<void>(`/session/${id}`, { method: "DELETE" })
}

export function abortSession(id: string): Promise<void> {
  return apiFetch<void>(`/session/${id}/abort`, { method: "POST" })
}

export async function openSessionEventSource(id: string): Promise<EventSource> {
  const base = await getServerUrl()
  return new EventSource(`${base}/session/${id}/events`)
}

export async function openGlobalEventSource(): Promise<EventSource> {
  const base = await getServerUrl()
  return new EventSource(`${base}/events`)
}

export interface SendPromptParams {
  text: string
  model?: { provider: string; modelId: string }
  thinkingLevel?: string
  images?: ImageContent[]
  streamingBehavior?: "steer" | "followUp"
  expandPromptTemplates?: boolean
}

export function sendPrompt(
  id: string,
  params: SendPromptParams
): Promise<SendPromptResponse> {
  return apiFetch<SendPromptResponse>(`/session/${id}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: params.text,
      provider: params.model?.provider,
      model: params.model?.modelId,
      thinkingLevel: params.thinkingLevel,
      images: params.images,
      streamingBehavior: params.streamingBehavior,
      expandPromptTemplates: params.expandPromptTemplates,
    }),
  })
}

/**
 * Queue a steering message while the agent is running.
 * Delivered after the current assistant turn finishes its tool calls.
 */
export function steer(
  id: string,
  text: string
): Promise<SendPromptResponse> {
  return apiFetch<SendPromptResponse>(`/session/${id}/steer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  })
}

/**
 * Queue a follow-up message to be processed after the agent finishes.
 * Only delivered when agent has no more tool calls or steering messages.
 */
export function followUp(
  id: string,
  text: string
): Promise<SendPromptResponse> {
  return apiFetch<SendPromptResponse>(`/session/${id}/follow-up`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  })
}

// ── Messages ─────────────────────────────────────────────────────────────────

/**
 * Response from /session/:id/messages endpoint.
 * Returns complete message blocks with all data fields.
 */
export interface SessionMessagesResponse {
  blocks: MessageBlock[]
}

/**
 * Fetch all message blocks for a session.
 * Returns complete message data including thinking, tool calls, model info, etc.
 */
export function listMessages(
  sessionId: string
): Promise<SessionMessagesResponse> {
  return apiFetch<SessionMessagesResponse>(
    `/session/${sessionId}/messages`
  )
}

/**
 * Response from /session/:id/running-tools endpoint.
 * Returns tool blocks that are currently running.
 */
export interface RunningToolsResponse {
  runningTools: MessageBlock[]
}

/**
 * Fetch running tool blocks for a session.
 * Used to restore tool state on page reload/reconnect.
 */
export function listRunningTools(
  sessionId: string
): Promise<RunningToolsResponse> {
  return apiFetch<RunningToolsResponse>(
    `/session/${sessionId}/running-tools`
  )
}

/**
 * Legacy message list endpoint for backward compatibility.
 * @deprecated Use listMessages instead.
 */
export function listLegacyMessages(
  sessionId: string
): Promise<{ messages: StoredMessageDto[] }> {
  return apiFetch<{ messages: StoredMessageDto[] }>(
    `/session/${sessionId}/messages`
  )
}

// ── Title ─────────────────────────────────────────────────────────────────────

export interface TitleResponse {
  title: string
}

export function generateTitle(message: string): Promise<TitleResponse> {
  return apiFetch<TitleResponse>("/title", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  })
}

// ── Branches ──────────────────────────────────────────────────────────────────

export interface BranchResponse {
  branch: string | null
}

export interface BranchesResponse {
  branches: string[]
}

export interface InitializeGitRepositoryResponse {
  branch: string | null
  branches: string[]
}

export function getBranch(sessionId: string): Promise<BranchResponse> {
  return apiFetch<BranchResponse>(`/session/${sessionId}/branch`)
}

export function listBranches(sessionId: string): Promise<BranchesResponse> {
  return apiFetch<BranchesResponse>(`/session/${sessionId}/branches`)
}

export function checkoutBranch(
  sessionId: string,
  branch: string
): Promise<BranchResponse> {
  return apiFetch<BranchResponse>(`/session/${sessionId}/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ branch }),
  })
}

export function createBranch(
  sessionId: string,
  branch: string
): Promise<BranchResponse> {
  return apiFetch<BranchResponse>(`/session/${sessionId}/branch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ branch }),
  })
}

export function initializeGitRepository(
  sessionId: string
): Promise<InitializeGitRepositoryResponse> {
  return apiFetch<InitializeGitRepositoryResponse>(
    `/session/${sessionId}/git/init`,
    {
      method: "POST",
    }
  )
}

// ── Models ─────────────────────────────────────────────────────────────────

export interface Model {
  id: string
  name: string
  provider: string
  reasoning: boolean
  thinkingLevels: string[]
}

export interface ModelsResponse {
  models: Model[]
}

export function fetchModels(signal?: AbortSignal): Promise<ModelsResponse> {
  return apiFetch<ModelsResponse>("/models", { signal })
}

// ── Slash commands ─────────────────────────────────────────────────────────

export interface SlashCommand {
  name: string
  description?: string
  source: "skill" | "prompt"
}

export async function fetchSlashCommands(
  sessionId: string
): Promise<SlashCommand[]> {
  const data = await apiFetch<{ commands: SlashCommand[] }>(
    `/session/${sessionId}/commands`
  )
  return data.commands
}

// ── Context usage ──────────────────────────────────────────────────────────

export function fetchThinkingLevels(
  sessionId: string
): Promise<{ levels: string[] }> {
  return apiFetch<{ levels: string[] }>(`/session/${sessionId}/thinking-levels`)
}

export interface ContextUsage {
  tokens: number | null
  contextWindow: number
  percent: number | null
}

export interface ContextUsageResponse {
  contextUsage: ContextUsage | null
}

export function fetchContextUsage(
  sessionId: string
): Promise<ContextUsageResponse> {
  return apiFetch<ContextUsageResponse>(`/session/${sessionId}/context-usage`)
}

export function compactSession(sessionId: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/session/${sessionId}/compact`, {
    method: "POST",
  })
}

// ── Session stats ──────────────────────────────────────────────────────────

export interface SessionTokenStats {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  total: number
}

export interface SessionStats {
  sessionFile: string | null
  sessionId: string
  userMessages: number
  assistantMessages: number
  toolCalls: number
  toolResults: number
  totalMessages: number
  tokens: SessionTokenStats
  cost: number
  contextUsage?: ContextUsage
}

export interface SessionStatsResponse {
  stats: SessionStats | null
}

export function fetchSessionStats(
  sessionId: string
): Promise<SessionStatsResponse> {
  return apiFetch<SessionStatsResponse>(`/session/${sessionId}/stats`)
}

// ── Workspace files ────────────────────────────────────────────────────────

export type WorkspaceEntry = { path: string; type: "file" | "dir" }

export async function listWorkspaceFiles(
  sessionId: string
): Promise<WorkspaceEntry[]> {
  const data = await apiFetch<{ entries: WorkspaceEntry[] }>(
    `/session/${sessionId}/workspace-files`
  )
  return data.entries
}
