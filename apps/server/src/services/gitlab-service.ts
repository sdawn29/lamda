import { homedir } from "node:os";
import { existsSync } from "node:fs";
import * as gl from "@lamda/gitlab";
import { getThread, getWorkspace, listWorkspacesWithThreads } from "@lamda/db";
import { store } from "../store.js";

export { gl };

export function sessionCwd(sessionId: string): string | null {
  return store.getCwd(sessionId) ?? null;
}

export function workspaceCwd(workspaceId: string): string | null {
  return getWorkspace(workspaceId)?.path ?? null;
}

export function anyRepoCwd(): string {
  for (const ws of listWorkspacesWithThreads()) {
    if (ws.path && existsSync(ws.path)) return ws.path;
  }
  return homedir();
}

/**
 * Repo directory for a thread: its git worktree when present on disk, otherwise
 * the workspace path. Mirrors `threadRepoCwd` in github-service.
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

// glab status is mildly expensive (2-3 subprocesses); cache briefly so
// per-session tool refreshes don't repeatedly shell out.
let availabilityCache: { at: number; available: boolean } | null = null;

/** Whether glab is installed and authenticated, cached for ~60s. */
export async function isGitlabAvailable(cwd: string): Promise<boolean> {
  if (availabilityCache && Date.now() - availabilityCache.at < 60_000) {
    return availabilityCache.available;
  }
  const status = await gl.getGlabStatus(cwd);
  const available = status.installed && status.authenticated;
  availabilityCache = { at: Date.now(), available };
  return available;
}
