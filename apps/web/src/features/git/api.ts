import { apiFetch } from "@/shared/lib/client"

const base = (sessionId: string) => `/session/${sessionId}/git`

export async function gitStatus(sessionId: string): Promise<string> {
  const { raw } = await apiFetch<{ raw: string }>(`${base(sessionId)}/status`)
  return raw
}

export async function gitDiffStat(
  sessionId: string
): Promise<{ additions: number; deletions: number }> {
  return apiFetch<{ additions: number; deletions: number }>(
    `${base(sessionId)}/diff-stat`
  )
}

export async function gitFileDiff(
  sessionId: string,
  filePath: string,
  statusCode: string
): Promise<string> {
  const params = new URLSearchParams({ file: filePath, status: statusCode })
  const { diff } = await apiFetch<{ diff: string }>(
    `${base(sessionId)}/diff?${params}`
  )
  return diff
}

export async function gitCommit(
  sessionId: string,
  message: string
): Promise<string> {
  const { output } = await apiFetch<{ output: string }>(
    `${base(sessionId)}/commit`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    }
  )
  return output
}

export function gitStage(sessionId: string, filePath: string): Promise<void> {
  return apiFetch<void>(`${base(sessionId)}/stage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filePath }),
  })
}

export function gitUnstage(sessionId: string, filePath: string): Promise<void> {
  return apiFetch<void>(`${base(sessionId)}/unstage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filePath }),
  })
}

export function gitStageAll(sessionId: string): Promise<void> {
  return apiFetch<void>(`${base(sessionId)}/stage-all`, { method: "POST" })
}

export function gitUnstageAll(sessionId: string): Promise<void> {
  return apiFetch<void>(`${base(sessionId)}/unstage-all`, { method: "POST" })
}

export function gitStash(sessionId: string, message?: string): Promise<void> {
  return apiFetch<void>(`${base(sessionId)}/stash`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  })
}

export async function gitStashList(sessionId: string): Promise<string> {
  const { raw } = await apiFetch<{ raw: string }>(
    `${base(sessionId)}/stash-list`
  )
  return raw
}

export function gitStashPop(sessionId: string, ref: string): Promise<void> {
  return apiFetch<void>(`${base(sessionId)}/stash-pop`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ref }),
  })
}

export function gitStashApply(sessionId: string, ref: string): Promise<void> {
  return apiFetch<void>(`${base(sessionId)}/stash-apply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ref }),
  })
}

export function gitStashDrop(sessionId: string, ref: string): Promise<void> {
  return apiFetch<void>(`${base(sessionId)}/stash-drop`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ref }),
  })
}

export function gitRevertFile(
  sessionId: string,
  filePath: string,
  raw: string
): Promise<void> {
  return apiFetch<void>(`${base(sessionId)}/revert-file`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filePath, raw }),
  })
}

export function gitPush(sessionId: string): Promise<void> {
  return apiFetch<void>(`${base(sessionId)}/push`, { method: "POST" })
}

export async function gitClone(url: string, path: string): Promise<void> {
  return apiFetch<void>("/git/clone", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, path }),
  })
}

export async function gitGenerateCommitMessage(
  sessionId: string,
  promptTemplate?: string
): Promise<string> {
  const { message } = await apiFetch<{ message: string }>(
    `${base(sessionId)}/generate-commit-message`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ promptTemplate }),
    }
  )
  return message
}
