import { apiFetch } from "@/shared/lib/client"

const base = (sessionId: string) => `/session/${sessionId}/git`

export async function gitStatus(
  sessionId: string
): Promise<{ raw: string; isGitRepo: boolean }> {
  return apiFetch<{ raw: string; isGitRepo: boolean }>(
    `${base(sessionId)}/status`
  )
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

export function gitFetch(sessionId: string): Promise<void> {
  return apiFetch<void>(`${base(sessionId)}/fetch`, { method: "POST" })
}

export function gitPull(sessionId: string): Promise<void> {
  return apiFetch<void>(`${base(sessionId)}/pull`, { method: "POST" })
}

export async function gitClone(url: string, path: string): Promise<string> {
  const { path: clonedPath } = await apiFetch<{ ok: boolean; path: string }>(
    "/git/clone",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, path }),
    }
  )
  return clonedPath
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

export interface LogEntry {
  sha: string
  shortSha: string
  author: string
  date: string
  subject: string
  body: string
}

export async function gitLog(sessionId: string, limit = 50): Promise<LogEntry[]> {
  const { entries } = await apiFetch<{ entries: LogEntry[] }>(
    `${base(sessionId)}/log?limit=${limit}`
  )
  return entries
}

export async function gitShow(sessionId: string, sha: string): Promise<string> {
  const { diff } = await apiFetch<{ diff: string }>(
    `${base(sessionId)}/show?sha=${encodeURIComponent(sha)}`
  )
  return diff
}

export interface CommitFile {
  path: string
  status: string
  added: number
  removed: number
}

export async function gitShowFiles(sessionId: string, sha: string): Promise<CommitFile[]> {
  const { files } = await apiFetch<{ files: CommitFile[] }>(
    `${base(sessionId)}/show-files?sha=${encodeURIComponent(sha)}`
  )
  return files
}

export async function gitShowFileDiff(sessionId: string, sha: string, filePath: string): Promise<string> {
  const params = new URLSearchParams({ sha, file: filePath })
  const { diff } = await apiFetch<{ diff: string }>(
    `${base(sessionId)}/show-file-diff?${params}`
  )
  return diff
}

export async function getAheadBehind(
  sessionId: string
): Promise<{ ahead: number | null; behind: number | null }> {
  return apiFetch<{ ahead: number | null; behind: number | null }>(
    `${base(sessionId)}/ahead-behind`
  )
}

// ── Turn checkpoints (multi-turn history) ─────────────────────────────────────

export interface TurnFileSummary {
  filePath: string
  postStatusCode: string
  wasCreatedByTurn: boolean
}

export interface TurnSummary {
  id: number
  sessionId: string
  threadId: string
  startedAt: number
  endedAt: number
  checkpointSha: string
  files: TurnFileSummary[]
  inProgress: boolean
}

export interface TurnFileDetail {
  filePath: string
  postStatusCode: string
  preStatusCode: string
  wasCreatedByTurn: boolean
  preContent: string | null
}

export async function listTurns(sessionId: string): Promise<TurnSummary[]> {
  const { turns } = await apiFetch<{ turns: TurnSummary[] }>(
    `${base(sessionId)}/turns`
  )
  return turns
}

export async function getTurnFiles(sessionId: string, turnId: number): Promise<TurnFileDetail[]> {
  const { files } = await apiFetch<{ files: TurnFileDetail[] }>(
    `${base(sessionId)}/turns/${turnId}/files`
  )
  return files
}

export async function getTurnFileDiff(
  sessionId: string,
  turnId: number,
  filePath: string
): Promise<string> {
  const params = new URLSearchParams({ file: filePath })
  const { diff } = await apiFetch<{ diff: string }>(
    `${base(sessionId)}/turns/${turnId}/file-diff?${params}`
  )
  return diff
}

export interface TurnFileDiffStat {
  filePath: string
  additions: number
  deletions: number
}

export interface TurnDiffStat {
  additions: number
  deletions: number
  files: TurnFileDiffStat[]
}

export async function getTurnDiffStat(
  sessionId: string,
  turnId: number
): Promise<TurnDiffStat> {
  return apiFetch<TurnDiffStat>(`${base(sessionId)}/turns/${turnId}/diff-stat`)
}

export function revertToTurn(sessionId: string, turnId: number): Promise<void> {
  return apiFetch<void>(`${base(sessionId)}/turns/${turnId}/revert`, { method: "POST" })
}

export function getWorkspaceBranch(
  workspaceId: string
): Promise<{ branch: string | null }> {
  return apiFetch<{ branch: string | null }>(`/workspace/${workspaceId}/branch`)
}

export function listWorkspaceBranches(
  workspaceId: string
): Promise<{ branches: string[] }> {
  return apiFetch<{ branches: string[] }>(`/workspace/${workspaceId}/branches`)
}

// ── Workspace-level history (no session required) ─────────────────────────────

export async function workspaceGitLog(
  workspaceId: string,
  limit = 50
): Promise<LogEntry[]> {
  const { entries } = await apiFetch<{ entries: LogEntry[] }>(
    `/workspace/${workspaceId}/git/log?limit=${limit}`
  )
  return entries
}

export async function workspaceGitShowFiles(
  workspaceId: string,
  sha: string
): Promise<CommitFile[]> {
  const { files } = await apiFetch<{ files: CommitFile[] }>(
    `/workspace/${workspaceId}/git/show-files?sha=${encodeURIComponent(sha)}`
  )
  return files
}

export async function workspaceGitShowFileDiff(
  workspaceId: string,
  sha: string,
  filePath: string
): Promise<string> {
  const params = new URLSearchParams({ sha, file: filePath })
  const { diff } = await apiFetch<{ diff: string }>(
    `/workspace/${workspaceId}/git/show-file-diff?${params}`
  )
  return diff
}


