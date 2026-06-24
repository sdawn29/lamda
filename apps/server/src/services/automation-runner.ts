import { mkdir } from "node:fs/promises"
import {
  getAutomation,
  getWorkspace,
  getThread,
  insertThread,
  setAutomationThread,
  setThreadWorktree,
  updateThreadMode,
  updateThreadApprovalMode,
  startAutomationRun,
  finishAutomationRun,
  hasActiveRun,
  type DbAutomation,
} from "@lamda/db"
import { lamdaWorktreePath, lamdaWorktreesDir } from "@lamda/pi-sdk"
import {
  getRepoRoot,
  getCurrentBranch,
  getRefSha,
  addWorktree,
} from "@lamda/git"
import { store } from "../store.js"
import {
  createSessionForThread,
  openSessionForThread,
  resolveThreadCwd,
  refreshWorktreeWatch,
} from "./session-service.js"
import { sendPrompt } from "./prompt-runner.js"
import { automationBroadcaster } from "../automation-broadcaster.js"

export interface RunResult {
  status: "ok" | "error" | "skipped"
  threadId?: string
  error?: string
}

/** Derive a git-branch-safe slug for an automation's dedicated worktree branch. */
function automationBranch(automation: DbAutomation): string {
  const slug = automation.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
  return `automation/${slug || automation.id.slice(0, 8)}`
}

/**
 * Create the dedicated worktree for an automation's thread on first run. Returns
 * the worktree path on success, or throws with a user-facing reason (no git
 * repo / unborn branch) so the caller can record it and skip the run rather than
 * silently editing the user's working tree.
 */
async function ensureWorktree(
  automation: DbAutomation,
  threadId: string,
  workspacePath: string,
  workspaceName: string,
): Promise<string> {
  const repoRoot = await getRepoRoot(workspacePath)
  if (!repoRoot) {
    throw new Error(
      "Workspace is not a git repository — disable the worktree option to run locally.",
    )
  }
  const baseRef = await getCurrentBranch(repoRoot)
  if (!baseRef || !(await getRefSha(repoRoot, baseRef))) {
    throw new Error(
      `Base branch "${baseRef ?? "?"}" has no commits yet — make an initial commit, or disable the worktree option.`,
    )
  }
  const branch = automationBranch(automation)
  const worktreePath = lamdaWorktreePath(workspaceName, branch)
  await mkdir(lamdaWorktreesDir(workspaceName), { recursive: true })
  await addWorktree(repoRoot, worktreePath, branch, baseRef)
  setThreadWorktree(threadId, worktreePath, branch, true, baseRef)
  return worktreePath
}

/**
 * Resolve (or lazily create) the dedicated thread an automation runs in. The
 * thread is reused across runs so its history and worktree accumulate.
 */
async function ensureThread(automation: DbAutomation): Promise<string> {
  const existing = automation.threadId
    ? getThread(automation.threadId)
    : undefined
  if (existing) {
    // Keep the thread's mode/approval in sync with edits to the automation.
    updateThreadMode(existing.id, automation.mode)
    updateThreadApprovalMode(existing.id, automation.approvalMode)
    return existing.id
  }

  const ws = getWorkspace(automation.workspaceId)
  if (!ws) throw new Error(`Workspace ${automation.workspaceId} not found`)

  const threadId = insertThread(automation.workspaceId, {
    title: automation.name,
    mode: automation.mode,
    modelId: automation.modelId,
    approvalMode: automation.approvalMode,
  })
  setAutomationThread(automation.id, threadId)

  if (automation.useWorktree) {
    await ensureWorktree(automation, threadId, ws.path, ws.name)
  }
  return threadId
}

/** Get a live session for the thread, resuming or creating one as needed. */
async function ensureSession(
  threadId: string,
  workspaceId: string,
  workspacePath: string,
): Promise<string> {
  const live = store.getByThreadId(threadId)
  if (live) return live.sessionId

  const thread = getThread(threadId)
  const cwd = resolveThreadCwd(thread, workspacePath)

  if (thread?.sessionFile) {
    try {
      const handle = await openSessionForThread(
        threadId,
        thread.sessionFile,
        cwd,
        workspaceId,
      )
      const sessionId = store.create(handle, cwd, threadId, workspaceId)
      refreshWorktreeWatch(sessionId)
      return sessionId
    } catch {
      // Corrupt/unreadable session file — fall back to a fresh session.
    }
  }
  return createSessionForThread(threadId, cwd, workspaceId)
}

/**
 * Execute an automation headlessly: resolve its dedicated thread + session,
 * send the stored prompt, and await the turn. Records a run-history row and
 * updates the automation's last-run status. Never throws — failures are
 * captured and returned. A run already in flight for the automation is skipped.
 */
export async function runAutomation(
  automationId: string,
  trigger: "scheduled" | "manual",
): Promise<RunResult> {
  const automation = getAutomation(automationId)
  if (!automation) return { status: "error", error: "Automation not found" }

  if (hasActiveRun(automationId)) {
    return { status: "skipped" }
  }

  const ws = getWorkspace(automation.workspaceId)
  if (!ws) return { status: "error", error: "Workspace not found" }

  let threadId: string
  try {
    threadId = await ensureThread(automation)
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    const runId = startAutomationRun(automationId, trigger, null)
    finishAutomationRun(runId, automationId, "error", error, null)
    automationBroadcaster.broadcast()
    return { status: "error", error }
  }

  // Create the session up front so the thread has a resolvable sessionId the
  // moment we announce the run. Otherwise clients open the freshly-created
  // thread before its session exists and are stuck on a skeleton loader (the
  // thread route renders a skeleton whenever thread.sessionId is null).
  let sessionId: string
  try {
    sessionId = await ensureSession(threadId, ws.id, ws.path)
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    const runId = startAutomationRun(automationId, trigger, threadId)
    finishAutomationRun(runId, automationId, "error", error, threadId)
    automationBroadcaster.broadcast()
    return { status: "error", threadId, error }
  }

  const runId = startAutomationRun(automationId, trigger, threadId)
  // Notify clients: the run is now active and a dedicated thread (with its
  // session) may have just been created, so the sidebar/thread tree refreshes.
  automationBroadcaster.broadcast()
  try {
    await sendPrompt(sessionId, automation.prompt)
    finishAutomationRun(runId, automationId, "ok", null, threadId)
    automationBroadcaster.broadcast()
    return { status: "ok", threadId }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    finishAutomationRun(runId, automationId, "error", error, threadId)
    automationBroadcaster.broadcast()
    return { status: "error", threadId, error }
  }
}
