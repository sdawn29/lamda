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

export function sendPrompt(id: string, text: string): Promise<SendPromptResponse> {
  return apiFetch<SendPromptResponse>(`/session/${id}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  })
}
