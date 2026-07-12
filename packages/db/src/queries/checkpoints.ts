import { desc, eq } from "drizzle-orm";
import { db } from "../client.js";
import { checkpoints } from "../schema.js";

export interface DbCheckpoint {
  id: string;
  threadId: string;
  commitSha: string;
  label: string;
  createdAt: number;
}

/** Max length of the label persisted on a checkpoint (first ~80 chars of the prompt). */
const LABEL_MAX_LENGTH = 80;

export function insertCheckpoint(input: {
  threadId: string;
  commitSha: string;
  label: string;
  createdAt?: number;
}): DbCheckpoint {
  const row: DbCheckpoint = {
    id: crypto.randomUUID(),
    threadId: input.threadId,
    commitSha: input.commitSha,
    label: input.label.slice(0, LABEL_MAX_LENGTH),
    createdAt: input.createdAt ?? Date.now(),
  };
  db.insert(checkpoints).values(row).run();
  return row;
}

/** Newest first. */
export function listCheckpointsByThread(threadId: string): DbCheckpoint[] {
  return db
    .select()
    .from(checkpoints)
    .where(eq(checkpoints.threadId, threadId))
    .orderBy(desc(checkpoints.createdAt))
    .all();
}

export function getCheckpoint(id: string): DbCheckpoint | undefined {
  return db.select().from(checkpoints).where(eq(checkpoints.id, id)).get();
}
