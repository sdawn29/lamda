import { watch, existsSync, type FSWatcher } from "node:fs";
import { dirname, basename } from "node:path";

/**
 * Watches a live session's git worktree directory and fires `onRemoved` the
 * instant it disappears from disk (an external `git worktree remove`, a manual
 * delete, or a prune). In-app worktree transitions relocate the session
 * themselves, so this only catches out-of-band removal — without it, the agent
 * keeps running in a directory that no longer exists and every tool call fails
 * with ENOENT until the next prompt heals it.
 *
 * We watch the worktree's PARENT directory rather than the worktree itself:
 * watching a directory for its own deletion is unreliable across platforms,
 * whereas the parent reliably reports a `rename` for the removed child. Each
 * session has at most one watcher; re-watching or unwatching is idempotent.
 */
class WorktreeWatcher {
  private entries = new Map<string, FSWatcher>(); // sessionId → watcher

  watch(
    sessionId: string,
    worktreePath: string,
    onRemoved: (sessionId: string) => void | Promise<void>,
  ): void {
    this.unwatch(sessionId);

    const parent = dirname(worktreePath);
    const name = basename(worktreePath);
    // Nothing to watch — the worktree (or its parent) is already gone. The
    // resolveThreadCwd / prompt-time guards cover this already-stale case.
    if (!existsSync(parent) || !existsSync(worktreePath)) return;

    let watcher: FSWatcher;
    try {
      watcher = watch(parent, (_event, changed) => {
        // `changed` is the affected entry's name (or null on some platforms).
        // Ignore events for siblings; re-check existence for our own.
        if (changed != null && changed !== name) return;
        if (existsSync(worktreePath)) return;
        this.unwatch(sessionId);
        void Promise.resolve(onRemoved(sessionId)).catch((err) =>
          console.error(
            `[worktree-watcher] heal failed for session ${sessionId}:`,
            err,
          ),
        );
      });
    } catch (err) {
      console.warn(`[worktree-watcher] could not watch ${parent}:`, err);
      return;
    }
    watcher.on("error", () => this.unwatch(sessionId));
    this.entries.set(sessionId, watcher);
  }

  unwatch(sessionId: string): void {
    const watcher = this.entries.get(sessionId);
    if (!watcher) return;
    try {
      watcher.close();
    } catch {
      /* already closed */
    }
    this.entries.delete(sessionId);
  }
}

export const worktreeWatcher = new WorktreeWatcher();
