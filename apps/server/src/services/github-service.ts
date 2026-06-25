import { homedir } from "node:os";
import { existsSync } from "node:fs";
import * as gh from "@lamda/github";
import { getThread, getWorkspace, listWorkspacesWithThreads } from "@lamda/db";
import { store } from "../store.js";

export { gh };

/**
 * Working directory for a live session — its git worktree when attached,
 * otherwise the workspace path. Mirrors `gitCwd` so github operations resolve
 * against the same repo the agent and git panel use.
 */
export function sessionCwd(sessionId: string): string | null {
  return store.getCwd(sessionId) ?? null;
}

/** Working directory for a workspace by id. */
export function workspaceCwd(workspaceId: string): string | null {
  return getWorkspace(workspaceId)?.path ?? null;
}

/**
 * A directory to run repo-independent gh commands from (auth status doesn't
 * depend on the repo). Prefer any known workspace so gh inherits a real path;
 * fall back to the home directory.
 */
export function anyRepoCwd(): string {
  for (const ws of listWorkspacesWithThreads()) {
    if (ws.path && existsSync(ws.path)) return ws.path;
  }
  return homedir();
}

/**
 * Repo directory for a thread: its git worktree when present on disk, otherwise
 * the workspace path. Mirrors `resolveThreadCwd` without its self-healing side
 * effects, so the agent tools stay decoupled from session-service.
 */
export function threadRepoCwd(
  threadId: string | undefined,
  workspacePath: string,
): string {
  if (threadId) {
    const t = getThread(threadId);
    if (t?.worktreePath && existsSync(t.worktreePath)) return t.worktreePath;
  }
  return workspacePath;
}

// gh status is mildly expensive (2-3 subprocesses); cache briefly so per-session
// tool refreshes don't repeatedly shell out.
let availabilityCache: { at: number; available: boolean } | null = null;

/** Whether gh is installed and authenticated, cached for ~60s. */
export async function isGithubAvailable(cwd: string): Promise<boolean> {
  if (availabilityCache && Date.now() - availabilityCache.at < 60_000) {
    return availabilityCache.available;
  }
  const status = await gh.getGhStatus(cwd);
  const available = status.installed && status.authenticated;
  availabilityCache = { at: Date.now(), available };
  return available;
}
