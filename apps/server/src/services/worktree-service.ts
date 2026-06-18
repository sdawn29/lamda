import {
  deleteBranch,
  getRepoRoot,
  pruneWorktrees,
  removeWorktree,
} from "@lamda/git";
import { existsSync } from "node:fs";

export interface AttachedWorktree {
  worktreePath?: string | null;
  worktreeBranch?: string | null;
  ownsWorktreeBranch?: boolean;
}

export interface WorktreeCleanupResult {
  branchDeleteWarning?: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Removes a lamda-owned worktree. Pre-existing worktrees are deliberately left
 * alone: detaching a thread must never delete a checkout the user created.
 *
 * Worktree removal is mandatory. Branch deletion is best-effort because the
 * checkout is already gone by that point; callers surface the warning instead
 * of pretending the entire cleanup succeeded silently.
 */
export async function removeOwnedThreadWorktree(
  workspacePath: string,
  thread: AttachedWorktree,
): Promise<WorktreeCleanupResult> {
  if (
    !thread.ownsWorktreeBranch ||
    !thread.worktreePath ||
    !thread.worktreeBranch
  ) {
    return {};
  }

  const repoRoot = await getRepoRoot(workspacePath);
  if (!repoRoot) {
    throw new Error("Workspace is not a git repository");
  }

  if (existsSync(thread.worktreePath)) {
    await removeWorktree(repoRoot, thread.worktreePath, true);
  }
  await pruneWorktrees(repoRoot);

  try {
    await deleteBranch(repoRoot, thread.worktreeBranch);
    return {};
  } catch (error) {
    return {
      branchDeleteWarning: `Worktree removed, but branch "${thread.worktreeBranch}" could not be deleted: ${errorMessage(error)}`,
    };
  }
}
