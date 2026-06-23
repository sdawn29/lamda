import { randomUUID } from "node:crypto";
import { eq, and, ne } from "drizzle-orm";
import { db } from "../client.js";
import { threads, workspaces } from "../schema.js";

export function insertThread(
  workspaceId: string,
  options?: {
    title?: string;
    // A mode id: built-in ("ask" | "plan" | "agent") or a custom mode defined
    // by a `.lamda/modes/*.md` file. Validated against available modes upstream.
    mode?: string;
    approvalMode?: "ask" | "edits_allowed" | "all_allowed";
    modelId?: string | null;
    forkedFromId?: string;
    baseCheckpointSha?: string;
  },
): string {
  const id = randomUUID();
  db.insert(threads)
    .values({
      id,
      workspaceId,
      title: options?.title ?? "New Thread",
      mode: options?.mode ?? "agent",
      approvalMode: options?.approvalMode ?? "ask",
      modelId: options?.modelId ?? null,
      forkedFromId: options?.forkedFromId ?? null,
      baseCheckpointSha: options?.baseCheckpointSha ?? null,
      createdAt: Date.now(),
    })
    .run();
  return id;
}

export function getThread(id: string) {
  return db.select().from(threads).where(eq(threads.id, id)).get();
}

export function listThreadsForWorkspace(workspaceId: string) {
  return db
    .select()
    .from(threads)
    .where(eq(threads.workspaceId, workspaceId))
    .all();
}

export function getActiveWorktreeMerge(workspaceId: string) {
  return db
    .select()
    .from(threads)
    .where(
      and(
        eq(threads.workspaceId, workspaceId),
        eq(threads.worktreeMergeInProgress, true),
      ),
    )
    .get();
}

/**
 * Atomically claims the workspace checkout's merge slot for one thread.
 * SQLite serializes this transaction, preventing two concurrent HTTP requests
 * from both starting a merge after observing an empty slot.
 */
export function claimThreadWorktreeMerge(
  id: string,
  workspaceId: string,
): boolean {
  return db.transaction((tx) => {
    const active = tx
      .select({ id: threads.id })
      .from(threads)
      .where(
        and(
          eq(threads.workspaceId, workspaceId),
          eq(threads.worktreeMergeInProgress, true),
        ),
      )
      .get();
    if (active && active.id !== id) return false;

    tx.update(threads)
      .set({
        worktreeMergeInProgress: true,
        worktreeMergeHeadSha: null,
      })
      .where(eq(threads.id, id))
      .run();
    return true;
  });
}

export function updateThreadTitle(id: string, title: string) {
  db.update(threads).set({ title }).where(eq(threads.id, id)).run();
}

export function updateThreadSessionFile(id: string, sessionFile: string) {
  db.update(threads).set({ sessionFile }).where(eq(threads.id, id)).run();
}

export function updateThreadModel(id: string, modelId: string | null) {
  db.update(threads).set({ modelId }).where(eq(threads.id, id)).run();
}

/** Marks the thread as running inside a git worktree at `path` on `branch`. */
export function setThreadWorktree(
  id: string,
  path: string,
  branch: string,
  ownsBranch = false,
  baseBranch: string | null = null,
) {
  db.update(threads)
    .set({
      worktreePath: path,
      worktreeBranch: branch,
      worktreeBaseBranch: baseBranch,
      ownsWorktreeBranch: ownsBranch,
      worktreeMergeInProgress: false,
      worktreeMergeHeadSha: null,
    })
    .where(eq(threads.id, id))
    .run();
}

/** Clears a thread's worktree association so it runs in the workspace path again. */
export function clearThreadWorktree(id: string) {
  db.update(threads)
    .set({
      worktreePath: null,
      worktreeBranch: null,
      worktreeBaseBranch: null,
      ownsWorktreeBranch: false,
      worktreeMergeInProgress: false,
      worktreeMergeHeadSha: null,
    })
    .where(eq(threads.id, id))
    .run();
}

export function setThreadWorktreeMergeInProgress(
  id: string,
  inProgress: boolean,
) {
  db.update(threads)
    .set({
      worktreeMergeInProgress: inProgress,
      ...(inProgress ? {} : { worktreeMergeHeadSha: null }),
    })
    .where(eq(threads.id, id))
    .run();
}

export function setThreadWorktreeMergeHeadSha(id: string, sha: string) {
  db.update(threads)
    .set({ worktreeMergeHeadSha: sha })
    .where(eq(threads.id, id))
    .run();
}

export function setThreadWorktreeBaseBranch(id: string, branch: string) {
  db.update(threads)
    .set({ worktreeBaseBranch: branch })
    .where(eq(threads.id, id))
    .run();
}

export function updateThreadMode(id: string, mode: string) {
  db.update(threads).set({ mode }).where(eq(threads.id, id)).run();
}

export function updateThreadApprovalMode(
  id: string,
  approvalMode: "ask" | "edits_allowed" | "all_allowed",
) {
  db.update(threads).set({ approvalMode }).where(eq(threads.id, id)).run();
}

export function updateThreadStopped(id: string, isStopped: boolean) {
  db.update(threads).set({ isStopped }).where(eq(threads.id, id)).run();
}

export function updateThreadLastAccessed(id: string) {
  db.update(threads)
    .set({ lastAccessedAt: Date.now() })
    .where(eq(threads.id, id))
    .run();
}

/** Advance the memory-reflection watermark so future passes skip already-mined blocks. */
export function updateThreadLastReflectedAt(
  id: string,
  at: number = Date.now(),
) {
  db.update(threads)
    .set({ lastReflectedAt: at })
    .where(eq(threads.id, id))
    .run();
}

export function archiveThread(id: string) {
  db.update(threads).set({ isArchived: true }).where(eq(threads.id, id)).run();
}

export function unarchiveThread(id: string) {
  db.update(threads).set({ isArchived: false }).where(eq(threads.id, id)).run();
}

export function pinThread(id: string) {
  db.update(threads).set({ isPinned: true }).where(eq(threads.id, id)).run();
}

export function unpinThread(id: string) {
  db.update(threads).set({ isPinned: false }).where(eq(threads.id, id)).run();
}

export function listArchivedThreadsWithWorkspace() {
  return db
    .select({
      id: threads.id,
      workspaceId: threads.workspaceId,
      workspaceName: workspaces.name,
      workspacePath: workspaces.path,
      title: threads.title,
      modelId: threads.modelId,
      isStopped: threads.isStopped,
      isArchived: threads.isArchived,
      sessionFile: threads.sessionFile,
      lastAccessedAt: threads.lastAccessedAt,
      createdAt: threads.createdAt,
    })
    .from(threads)
    .innerJoin(workspaces, eq(threads.workspaceId, workspaces.id))
    .where(eq(threads.isArchived, true))
    .all();
}

export function deleteThread(id: string) {
  db.delete(threads).where(eq(threads.id, id)).run();
}
