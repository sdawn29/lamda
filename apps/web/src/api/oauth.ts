import { apiFetch, getServerUrl } from "./client"

export interface OAuthProvider {
  id: string
  name: string
  loggedIn: boolean
}

export type OAuthSseEvent =
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

export async function openOAuthEventSource(loginId: string): Promise<EventSource> {
  const base = await getServerUrl()
  return new EventSource(`${base}/auth/oauth/${loginId}/events`)
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
