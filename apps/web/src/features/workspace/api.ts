import {
  apiFetch,
  getResolvedServerToken,
  getServerUrl,
} from "@/shared/lib/client"

export interface CreateWorkspaceBody {
  name: string
  path: string
  provider?: string
  model?: string
}

export type Mode = "ask" | "plan" | "agent"

/** Tool-approval gating for a thread: prompt before risky tools, auto-approve
 *  file edits/writes only, or run every tool freely. */
export type ApprovalMode = "ask" | "edits_allowed" | "all_allowed"

export interface ThreadDto {
  id: string
  workspaceId: string
  title: string
  modelId: string | null
  isStopped: boolean
  mode: Mode
  approvalMode: ApprovalMode
  createdAt: number
  updatedAt: number
  sessionId: string | null
  isPinned?: boolean
  forkedFromId?: string | null
  /** Absolute worktree path when this thread runs inside a git worktree; null = local. */
  worktreePath?: string | null
  /** Branch checked out in the thread's worktree; null when local. */
  worktreeBranch?: string | null
}

export interface WorkspaceDto {
  id: string
  name: string
  path: string
  openWithAppId: string | null
  isPinned?: boolean
  env: Record<string, string>
  /** Relative path of the detected project icon (e.g. "public/favicon.ico"), or null if none found. */
  icon: string | null
  createdAt: number
  threads: ThreadDto[]
}

export function listWorkspaces(): Promise<{ workspaces: WorkspaceDto[] }> {
  return apiFetch<{ workspaces: WorkspaceDto[] }>("/workspaces")
}

export async function createWorkspace(
  body: CreateWorkspaceBody
): Promise<{ workspace: WorkspaceDto; existing?: true }> {
  const base = await getServerUrl()
  const token = getResolvedServerToken()
  const res = await fetch(`${base}/workspace`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
  if (res.status === 409) {
    const data = (await res.json()) as { workspace: WorkspaceDto }
    return { workspace: data.workspace, existing: true }
  }
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`API ${res.status}: ${text}`)
  }
  return res.json() as Promise<{ workspace: WorkspaceDto }>
}

export function deleteWorkspace(id: string): Promise<void> {
  return apiFetch<void>(`/workspace/${id}`, { method: "DELETE" })
}

// ── Thread worktrees ──────────────────────────────────────────────────────────

export interface CreateThreadWorktreeBody {
  /** Name of the new branch to create for the worktree. */
  newBranch: string
  /** Base ref to fork from; defaults to the workspace's current branch when omitted. */
  baseRef?: string
}

/** Moves a thread into a freshly created worktree on a new branch. */
export function createThreadWorktree(
  threadId: string,
  body: CreateThreadWorktreeBody
): Promise<{ worktreePath: string; worktreeBranch: string }> {
  return apiFetch<{ worktreePath: string; worktreeBranch: string }>(
    `/thread/${threadId}/worktree`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  )
}

/** Moves a thread into an existing worktree identified by its branch. */
export function enterThreadWorktree(
  threadId: string,
  branch: string
): Promise<{ worktreePath: string; worktreeBranch: string }> {
  return apiFetch<{ worktreePath: string; worktreeBranch: string }>(
    `/thread/${threadId}/worktree/enter`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branch }),
    }
  )
}

/** Moves a thread back to the workspace directory. */
export function switchThreadToLocal(
  threadId: string
): Promise<{ ok: true; cleanupWarning?: string }> {
  return apiFetch<{ ok: true; cleanupWarning?: string }>(
    `/thread/${threadId}/worktree/local`,
    {
      method: "POST",
    }
  )
}

/**
 * Removes the thread's managed worktree (keeping its branch) and checks that
 * branch out in the workspace directory, so the thread continues locally on the
 * same branch without merging. Uncommitted changes in the worktree are carried
 * over (stash → pop); `cleanupWarning` is set if restoring them didn't apply
 * cleanly and they were left in the stash list.
 */
export function checkoutThreadWorktreeToLocal(
  threadId: string
): Promise<{ ok: true; branch: string; cleanupWarning?: string }> {
  return apiFetch<{ ok: true; branch: string; cleanupWarning?: string }>(
    `/thread/${threadId}/worktree/checkout-local`,
    {
      method: "POST",
    }
  )
}

/** Result of a merge attempt. `uncommitted` asks the caller to confirm forcing. */
export type MergeWorktreeResult =
  | { ok: true; branch: string; cleanupWarning?: string }
  | { ok: false; uncommitted: true; error: string }
  | {
      ok: false
      uncommitted: false
      error: string
      conflicts: string[]
      readyToContinue: boolean
    }
  | { ok: false; uncommitted: false; error: string }

/**
 * Merges a thread's worktree branch back into the workspace, then removes the
 * worktree and returns the thread to the workspace directory. A 409 with
 * `uncommitted` means the worktree has un-mergeable changes — re-call with
 * `force` to proceed. Other 409s (e.g. merge conflicts) surface as errors.
 */
export async function mergeThreadWorktree(
  threadId: string,
  force = false
): Promise<MergeWorktreeResult> {
  const base = await getServerUrl()
  const token = getResolvedServerToken()
  const res = await fetch(
    `${base}/thread/${threadId}/worktree/merge?force=${force}`,
    {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }
  )
  if (res.ok) {
    const data = (await res.json().catch(() => ({}))) as {
      branch?: string
      cleanupWarning?: string
    }
    return {
      ok: true,
      branch: data.branch ?? "",
      cleanupWarning: data.cleanupWarning,
    }
  }
  const data = (await res.json().catch(() => ({}))) as {
    error?: string
    uncommitted?: boolean
    conflicts?: string[]
    conflictState?: boolean
    readyToContinue?: boolean
  }
  if (res.status === 409 && data.uncommitted) {
    return {
      ok: false,
      uncommitted: true,
      error: data.error ?? "Worktree has uncommitted changes",
    }
  }
  if (res.status === 409 && (data.conflictState || data.conflicts?.length)) {
    return {
      ok: false,
      uncommitted: false,
      error: data.error ?? "Merge conflicts need resolution",
      conflicts: data.conflicts ?? [],
      readyToContinue: data.readyToContinue ?? false,
    }
  }
  return {
    ok: false,
    uncommitted: false,
    error: data.error ?? `Merge failed (${res.status})`,
  }
}

export function resolveThreadWorktreeConflict(
  threadId: string,
  filePath: string,
  strategy: "ours" | "theirs"
): Promise<{ conflicts: string[] }> {
  return apiFetch<{ conflicts: string[] }>(
    `/thread/${threadId}/worktree/merge/resolve`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filePath, strategy }),
    }
  )
}

export function getThreadWorktreeConflictFile(
  threadId: string,
  filePath: string
): Promise<{ content: string }> {
  return apiFetch<{ content: string }>(
    `/thread/${threadId}/worktree/merge/conflict?file=${encodeURIComponent(filePath)}`
  )
}

export function resolveThreadWorktreeConflictContent(
  threadId: string,
  filePath: string,
  content: string
): Promise<{ conflicts: string[] }> {
  return apiFetch<{ conflicts: string[] }>(
    `/thread/${threadId}/worktree/merge/resolve-content`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filePath, content }),
    }
  )
}

export function continueThreadWorktreeMerge(
  threadId: string
): Promise<{ merged: true; branch: string; cleanupWarning?: string }> {
  return apiFetch<{
    merged: true
    branch: string
    cleanupWarning?: string
  }>(`/thread/${threadId}/worktree/merge/continue`, { method: "POST" })
}

export function abortThreadWorktreeMerge(threadId: string): Promise<void> {
  return apiFetch<void>(`/thread/${threadId}/worktree/merge/abort`, {
    method: "POST",
  })
}

export function updateWorkspaceOpenWithApp(
  id: string,
  appId: string | null
): Promise<void> {
  return apiFetch<void>(`/workspace/${id}/open-with-app`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ appId }),
  })
}

export function updateWorkspaceEnv(
  id: string,
  env: Record<string, string>
): Promise<void> {
  return apiFetch<void>(`/workspace/${id}/env`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ env }),
  })
}

export function pinWorkspace(workspaceId: string): Promise<void> {
  return apiFetch<void>(`/workspace/${workspaceId}/pin`, { method: "PATCH" })
}

export function unpinWorkspace(workspaceId: string): Promise<void> {
  return apiFetch<void>(`/workspace/${workspaceId}/unpin`, { method: "PATCH" })
}

export interface CreateThreadOptions {
  title?: string
  mode?: Mode
  approvalMode?: ApprovalMode
  modelId?: string | null
  worktree?: {
    newBranch: string
    baseRef?: string
  }
}

export function createThread(
  workspaceId: string,
  options: CreateThreadOptions = {}
): Promise<{ thread: ThreadDto }> {
  return apiFetch<{ thread: ThreadDto }>(`/workspace/${workspaceId}/thread`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
  })
}

export function deleteThread(threadId: string): Promise<void> {
  return apiFetch<void>(`/thread/${threadId}`, { method: "DELETE" })
}

export function updateThreadTitle(
  threadId: string,
  title: string
): Promise<void> {
  return apiFetch<void>(`/thread/${threadId}/title`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  })
}

export function updateThreadModel(
  threadId: string,
  modelId: string | null
): Promise<void> {
  return apiFetch<void>(`/thread/${threadId}/model`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ modelId }),
  })
}

export function updateThreadMode(threadId: string, mode: Mode): Promise<void> {
  return apiFetch<void>(`/thread/${threadId}/mode`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode }),
  })
}

export function updateThreadApprovalMode(
  threadId: string,
  approvalMode: ApprovalMode
): Promise<void> {
  return apiFetch<void>(`/thread/${threadId}/approval-mode`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ approvalMode }),
  })
}

export function updateThreadStopped(
  threadId: string,
  stopped: boolean
): Promise<void> {
  return apiFetch<void>(`/thread/${threadId}/stopped`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stopped }),
  })
}

export function updateThreadLastAccessed(threadId: string): Promise<void> {
  return apiFetch<void>(`/thread/${threadId}/last-accessed`, {
    method: "PATCH",
  })
}

export function archiveThread(threadId: string): Promise<void> {
  return apiFetch<void>(`/thread/${threadId}/archive`, { method: "PATCH" })
}

export function unarchiveThread(threadId: string): Promise<void> {
  return apiFetch<void>(`/thread/${threadId}/unarchive`, { method: "PATCH" })
}

export function pinThread(threadId: string): Promise<void> {
  return apiFetch<void>(`/thread/${threadId}/pin`, { method: "PATCH" })
}

export function unpinThread(threadId: string): Promise<void> {
  return apiFetch<void>(`/thread/${threadId}/unpin`, { method: "PATCH" })
}

export interface ArchivedThreadDto {
  id: string
  workspaceId: string
  workspaceName: string
  workspacePath: string
  title: string
  modelId: string | null
  createdAt: number
}

export function listArchivedThreads(): Promise<{
  threads: ArchivedThreadDto[]
}> {
  return apiFetch<{ threads: ArchivedThreadDto[] }>("/threads/archived")
}

export function resetAllData(): Promise<void> {
  return apiFetch<void>("/reset", { method: "DELETE" })
}

export interface WorkspaceFileEntry {
  relativePath: string
  name: string
  isDirectory: boolean
}

export function listWorkspaceIndexFiles(
  workspaceId: string
): Promise<{ files: WorkspaceFileEntry[] }> {
  return apiFetch<{ files: WorkspaceFileEntry[] }>(
    `/workspace/${workspaceId}/files`
  )
}

/**
 * Lists the immediate children of one directory (lazy file tree). `relPath` ""
 * = root. When `threadId` names a thread running in a worktree, the listing is
 * read from that worktree's directory instead of the workspace path.
 */
export function listWorkspaceDir(
  workspaceId: string,
  relPath: string,
  threadId?: string | null
): Promise<{ entries: WorkspaceFileEntry[] }> {
  const params = new URLSearchParams()
  if (relPath) params.set("path", relPath)
  if (threadId) params.set("threadId", threadId)
  const query = params.toString() ? `?${params.toString()}` : ""
  return apiFetch<{ entries: WorkspaceFileEntry[] }>(
    `/workspace/${workspaceId}/dir${query}`
  )
}

export function triggerWorkspaceReindex(workspaceId: string): Promise<void> {
  return apiFetch<void>(`/workspace/${workspaceId}/reindex`, { method: "POST" })
}
