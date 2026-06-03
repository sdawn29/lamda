import { apiFetch, getServerWsUrl } from "@/shared/lib/client"

// ── App settings ──────────────────────────────────────────────────────────────

export async function fetchAppSettings(): Promise<Record<string, string>> {
  const res = await apiFetch<{ settings: Record<string, string> }>("/settings")
  return res.settings
}

export async function updateAppSetting(key: string, value: string): Promise<void> {
  await apiFetch(`/settings/${encodeURIComponent(key)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value }),
  })
}

// ── Provider API keys ─────────────────────────────────────────────────────────

export type ProviderKeys = Record<string, string>

export async function fetchProviders(signal?: AbortSignal): Promise<ProviderKeys> {
  const res = await apiFetch<{ providers: ProviderKeys }>("/providers", { signal })
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
  signal?: AbortSignal,
): Promise<{ providers: LocalProviders; error?: string }> {
  return apiFetch<{ providers: LocalProviders; error?: string }>(
    "/local-providers",
    { signal },
  )
}

export async function saveLocalProvider(
  id: string,
  config: LocalProviderConfig,
): Promise<{ error?: string; warning?: string }> {
  return apiFetch<{ ok: boolean; error?: string; warning?: string }>(
    `/local-providers/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    },
  )
}

export async function deleteLocalProvider(id: string): Promise<void> {
  await apiFetch(`/local-providers/${encodeURIComponent(id)}`, {
    method: "DELETE",
  })
}

// ── OAuth ─────────────────────────────────────────────────────────────────────

export interface OAuthProvider {
  id: string
  name: string
  loggedIn: boolean
}

export type OAuthWsEvent =
  | { type: "auth_url"; url: string; instructions?: string }
  | { type: "prompt"; promptId: string; message: string; placeholder?: string }
  | { type: "progress"; message: string }
  | { type: "done" }
  | { type: "error"; message: string }

export async function fetchOAuthProviders(signal?: AbortSignal): Promise<OAuthProvider[]> {
  const res = await apiFetch<{ providers: OAuthProvider[] }>("/auth/oauth/providers", { signal })
  return res.providers
}

export async function startOAuthLogin(providerId: string): Promise<string> {
  const res = await apiFetch<{ loginId: string }>(`/auth/oauth/${providerId}/login`, {
    method: "POST",
  })
  return res.loginId
}

export async function openOAuthWebSocket(loginId: string): Promise<WebSocket> {
  const base = await getServerWsUrl()
  return new WebSocket(`${base}/ws/auth/oauth/${loginId}/events`)
}

export async function respondToOAuthPrompt(
  loginId: string,
  promptId: string,
  value: string,
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
