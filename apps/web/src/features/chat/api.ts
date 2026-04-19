import { apiFetch, getServerUrl } from "@/shared/lib/client"
import type { StoredMessageDto } from "./types"

// ── Session ───────────────────────────────────────────────────────────────────

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

export function sendPrompt(
  id: string,
  text: string,
  model?: { provider: string; modelId: string },
  thinkingLevel?: string
): Promise<SendPromptResponse> {
  return apiFetch<SendPromptResponse>(`/session/${id}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      provider: model?.provider,
      model: model?.modelId,
      thinkingLevel,
    }),
  })
}

// ── Messages ──────────────────────────────────────────────────────────────────

export function listMessages(
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

// ── Models ────────────────────────────────────────────────────────────────────

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

// ── Slash commands ────────────────────────────────────────────────────────────

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

// ── Context usage ─────────────────────────────────────────────────────────────

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

// ── Workspace files ───────────────────────────────────────────────────────────

export type WorkspaceEntry = { path: string; type: "file" | "dir" }

export async function listWorkspaceFiles(
  sessionId: string
): Promise<WorkspaceEntry[]> {
  const data = await apiFetch<{ entries: WorkspaceEntry[] }>(
    `/session/${sessionId}/workspace-files`
  )
  return data.entries
}
