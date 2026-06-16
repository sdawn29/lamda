import { apiFetch, appendToken, getServerWsUrl } from "@/shared/lib/client"

// ── App settings ──────────────────────────────────────────────────────────────

export async function fetchAppSettings(): Promise<Record<string, string>> {
  const res = await apiFetch<{ settings: Record<string, string> }>("/settings")
  return res.settings
}

export async function updateAppSetting(
  key: string,
  value: string
): Promise<void> {
  await apiFetch(`/settings/${encodeURIComponent(key)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value }),
  })
}

// ── Agent memories ──────────────────────────────────────────────────────────────

export type MemoryScope = "user" | "workspace"
export type MemorySource = "agent" | "healing" | "user"
export type MemoryKind = "fact" | "preference" | "convention" | "decision" | "episode"

export interface MemoryItem {
  id: string
  scope: MemoryScope
  workspaceId: string | null
  title: string
  content: string
  category: string | null
  kind: MemoryKind
  source: MemorySource
  threadId: string | null
  filePaths: string | null
  confidence: number
  supersededBy: string | null
  pinned: boolean
  createdAt: number
  updatedAt: number
  lastUsedAt: number | null
  useCount: number
}

export async function fetchMemories(signal?: AbortSignal): Promise<MemoryItem[]> {
  const res = await apiFetch<{ memories: MemoryItem[] }>("/memories", { signal })
  return res.memories
}

export async function createMemory(input: {
  scope: MemoryScope
  workspaceId?: string
  title: string
  content: string
  category?: string
}): Promise<MemoryItem> {
  const res = await apiFetch<{ memory: MemoryItem }>("/memories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  return res.memory
}

export async function updateMemoryApi(
  id: string,
  fields: { title?: string; content?: string; category?: string | null; pinned?: boolean }
): Promise<void> {
  await apiFetch(`/memories/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  })
}

export async function deleteMemoryApi(id: string): Promise<void> {
  await apiFetch(`/memories/${encodeURIComponent(id)}`, { method: "DELETE" })
}

// ── Provider API keys ─────────────────────────────────────────────────────────

export type ProviderKeys = Record<string, string>

export async function fetchProviders(
  signal?: AbortSignal
): Promise<ProviderKeys> {
  const res = await apiFetch<{ providers: ProviderKeys }>("/providers", {
    signal,
  })
  return res.providers
}

export async function updateProviders(providers: ProviderKeys): Promise<void> {
  await apiFetch("/providers", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ providers }),
  })
}

// ── Local model providers (models.json) ────────────────────────────────────────

export type LocalProviderApi =
  | "openai-completions"
  | "openai-responses"
  | "anthropic-messages"
  | "google-generative-ai"

export interface LocalModelConfig {
  id: string
  name?: string
  reasoning?: boolean
  input?: ("text" | "image")[]
  contextWindow?: number
  maxTokens?: number
  compat?: Record<string, unknown>
}

export interface LocalProviderConfig {
  baseUrl: string
  api: LocalProviderApi
  apiKey?: string
  headers?: Record<string, string>
  authHeader?: boolean
  compat?: Record<string, unknown>
  models: LocalModelConfig[]
}

export type LocalProviders = Record<string, LocalProviderConfig>

export async function fetchLocalProviders(
  signal?: AbortSignal
): Promise<{ providers: LocalProviders; error?: string }> {
  return apiFetch<{ providers: LocalProviders; error?: string }>(
    "/local-providers",
    { signal }
  )
}

export async function saveLocalProvider(
  id: string,
  config: LocalProviderConfig
): Promise<{ error?: string; warning?: string }> {
  return apiFetch<{ ok: boolean; error?: string; warning?: string }>(
    `/local-providers/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    }
  )
}

export async function deleteLocalProvider(id: string): Promise<void> {
  await apiFetch(`/local-providers/${encodeURIComponent(id)}`, {
    method: "DELETE",
  })
}

// ── AI usage ──────────────────────────────────────────────────────────────────

export interface AiUsageTotals {
  requests: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  totalTokens: number
  cost: number
}

export interface AiUsageByModel extends AiUsageTotals {
  provider: string
  model: string
}

export interface AiUsageByWorkspace extends AiUsageTotals {
  workspaceId: string
  workspaceName: string | null
  threads: number
  models: AiUsageByModel[]
}

export interface AiUsageDaily {
  /** Local-time day in YYYY-MM-DD format. */
  day: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  totalTokens: number
  cost: number
}

export interface AiUsageStats {
  totals: AiUsageTotals
  byModel: AiUsageByModel[]
  byWorkspace: AiUsageByWorkspace[]
  daily: AiUsageDaily[]
}

/** Filter for usage queries: a rolling `days` window (0 = all-time) or an
 * inclusive `from`/`to` date range in local-time YYYY-MM-DD. */
export type AiUsageRange = { days: number } | { from: string; to: string }

/** Aggregated AI usage for the given range. */
export async function fetchAiUsage(
  range: AiUsageRange,
  signal?: AbortSignal
): Promise<AiUsageStats> {
  const params = new URLSearchParams(
    "days" in range
      ? { days: String(range.days) }
      : { from: range.from, to: range.to }
  )
  return apiFetch<AiUsageStats>(`/usage?${params}`, { signal })
}

// ── OAuth ─────────────────────────────────────────────────────────────────────

export interface OAuthProvider {
  id: string
  name: string
  loggedIn: boolean
}

export type OAuthWsEvent =
  | { type: "auth_url"; url: string; instructions?: string }
  | {
      type: "device_code"
      userCode: string
      verificationUri: string
      expiresInSeconds?: number
      intervalSeconds?: number
    }
  | { type: "prompt"; promptId: string; message: string; placeholder?: string }
  | {
      type: "select"
      promptId: string
      message: string
      options: { id: string; label: string }[]
    }
  | { type: "progress"; message: string }
  | { type: "done" }
  | { type: "error"; message: string }

export async function fetchOAuthProviders(
  signal?: AbortSignal
): Promise<OAuthProvider[]> {
  const res = await apiFetch<{ providers: OAuthProvider[] }>(
    "/auth/oauth/providers",
    { signal }
  )
  return res.providers
}

export async function startOAuthLogin(providerId: string): Promise<string> {
  const res = await apiFetch<{ loginId: string }>(
    `/auth/oauth/${providerId}/login`,
    {
      method: "POST",
    }
  )
  return res.loginId
}

export async function openOAuthWebSocket(loginId: string): Promise<WebSocket> {
  const base = await getServerWsUrl()
  return new WebSocket(appendToken(`${base}/ws/auth/oauth/${loginId}/events`))
}

export async function respondToOAuthPrompt(
  loginId: string,
  promptId: string,
  value: string
): Promise<void> {
  await apiFetch(`/auth/oauth/${loginId}/respond`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ promptId, value }),
  })
}

export async function abortOAuthLogin(loginId: string): Promise<void> {
  await apiFetch(`/auth/oauth/${loginId}/abort`, { method: "POST" })
}

export async function oauthLogout(providerId: string): Promise<void> {
  await apiFetch(`/auth/oauth/${providerId}`, { method: "DELETE" })
}
