import { apiFetch } from "./client"

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
  body: CreateSessionBody = {},
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

export function sendPrompt(
  id: string,
  text: string,
  model?: { provider: string; modelId: string },
): Promise<SendPromptResponse> {
  return apiFetch<SendPromptResponse>(`/session/${id}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, provider: model?.provider, model: model?.modelId }),
  })
}

export interface BranchResponse {
  branch: string | null
}

export function getBranch(sessionId: string): Promise<BranchResponse> {
  return apiFetch<BranchResponse>(`/session/${sessionId}/branch`)
}

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
