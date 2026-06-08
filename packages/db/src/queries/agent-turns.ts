import { eq, desc, asc, gte, and, inArray } from "drizzle-orm";
import { db } from "../client.js";
import { agentTurns, agentTurnFiles } from "../schema.js";

export interface AgentTurnFileSummary {
  filePath: string;
  postStatusCode: string;
  wasCreatedByTurn: boolean;
}

export interface AgentTurnSummary {
  id: number;
  sessionId: string;
  threadId: string;
  startedAt: number;
  endedAt: number;
  checkpointSha: string;
  files: AgentTurnFileSummary[];
}

export interface AgentTurnFileDetail {
  filePath: string;
  postStatusCode: string;
  preStatusCode: string;
  preContent: string | null;
  wasCreatedByTurn: boolean;
}

export function insertAgentTurn(data: {
  sessionId: string;
  threadId: string;
  startedAt: number;
  endedAt: number;
  checkpointSha: string;
  files: AgentTurnFileDetail[];
}): void {
  db.transaction(() => {
    const [turn] = db
      .insert(agentTurns)
      .values({
        sessionId: data.sessionId,
        threadId: data.threadId,
        startedAt: data.startedAt,
        endedAt: data.endedAt,
        checkpointSha: data.checkpointSha,
      })
      .returning()
      .all();

    if (!turn || data.files.length === 0) return;

    db.insert(agentTurnFiles)
      .values(
        data.files.map((f) => ({
          turnId: turn.id,
          filePath: f.filePath,
          postStatusCode: f.postStatusCode,
          preStatusCode: f.preStatusCode,
          preContent: f.preContent,
          wasCreatedByTurn: f.wasCreatedByTurn,
        }))
      )
      .run();
  });
}

function buildTurnSummaries(
  turns: { id: number; sessionId: string; threadId: string; startedAt: number; endedAt: number; checkpointSha: string }[]
): AgentTurnSummary[] {
  if (turns.length === 0) return [];

  const turnIds = turns.map((t) => t.id);
  const files = db
    .select()
    .from(agentTurnFiles)
    .where(inArray(agentTurnFiles.turnId, turnIds))
    .all();

  const filesByTurn = new Map<number, AgentTurnFileSummary[]>();
  for (const f of files) {
    const list = filesByTurn.get(f.turnId) ?? [];
    list.push({
      filePath: f.filePath,
      postStatusCode: f.postStatusCode,
      wasCreatedByTurn: f.wasCreatedByTurn,
    });
    filesByTurn.set(f.turnId, list);
  }

  return turns.map((t) => ({
    id: t.id,
    sessionId: t.sessionId,
    threadId: t.threadId,
    startedAt: t.startedAt,
    endedAt: t.endedAt,
    checkpointSha: t.checkpointSha,
    files: filesByTurn.get(t.id) ?? [],
  }));
}

export function listAgentTurns(threadId: string): AgentTurnSummary[] {
  const turns = db
    .select()
    .from(agentTurns)
    .where(eq(agentTurns.threadId, threadId))
    .orderBy(desc(agentTurns.id))
    .all();

  return buildTurnSummaries(turns);
}


export function getAgentTurnFiles(turnId: number): AgentTurnFileDetail[] {
  return db
    .select()
    .from(agentTurnFiles)
    .where(eq(agentTurnFiles.turnId, turnId))
    .all()
    .map((f) => ({
      filePath: f.filePath,
      postStatusCode: f.postStatusCode,
      preStatusCode: f.preStatusCode,
      preContent: f.preContent,
      wasCreatedByTurn: f.wasCreatedByTurn,
    }));
}

export function getAgentTurn(turnId: number): AgentTurnSummary | null {
  const turn = db
    .select()
    .from(agentTurns)
    .where(eq(agentTurns.id, turnId))
    .get();

  if (!turn) return null;

  return buildTurnSummaries([turn])[0] ?? null;
}

// Returns all turns for a thread with id >= fromTurnId, sorted oldest first.
// Keyed by threadId (durable) rather than sessionId (regenerated each server
// start) so turn history survives restarts and session re-creation.
export function getAgentTurnsFromId(threadId: string, fromTurnId: number): AgentTurnSummary[] {
  const turns = db
    .select()
    .from(agentTurns)
    .where(and(eq(agentTurns.threadId, threadId), gte(agentTurns.id, fromTurnId)))
    .orderBy(asc(agentTurns.id))
    .all();

  return buildTurnSummaries(turns);
}

// Deletes a turn and all subsequent turns for a thread (id >= fromTurnId).
// Returns the distinct, non-empty checkpoint SHAs of the deleted turns so the
// caller can drop their now-orphaned checkpoint refs.
export function deleteAgentTurnsFrom(threadId: string, fromTurnId: number): string[] {
  const turns = db
    .select({ id: agentTurns.id, checkpointSha: agentTurns.checkpointSha })
    .from(agentTurns)
    .where(and(eq(agentTurns.threadId, threadId), gte(agentTurns.id, fromTurnId)))
    .all();

  if (turns.length === 0) return [];

  const turnIds = turns.map((t) => t.id);
  db.transaction(() => {
    db.delete(agentTurnFiles).where(inArray(agentTurnFiles.turnId, turnIds)).run();
    db.delete(agentTurns).where(inArray(agentTurns.id, turnIds)).run();
  });

  return [...new Set(turns.map((t) => t.checkpointSha).filter(Boolean))];
}

// Deletes every turn for a thread (used when the thread itself is removed, since
// agent_turns has no FK cascade). Returns the deleted checkpoint SHAs.
export function deleteAgentTurnsForThread(threadId: string): string[] {
  const turns = db
    .select({ id: agentTurns.id, checkpointSha: agentTurns.checkpointSha })
    .from(agentTurns)
    .where(eq(agentTurns.threadId, threadId))
    .all();

  if (turns.length === 0) return [];

  const turnIds = turns.map((t) => t.id);
  db.transaction(() => {
    db.delete(agentTurnFiles).where(inArray(agentTurnFiles.turnId, turnIds)).run();
    db.delete(agentTurns).where(inArray(agentTurns.id, turnIds)).run();
  });

  return [...new Set(turns.map((t) => t.checkpointSha).filter(Boolean))];
}

// Returns the distinct, non-empty checkpoint SHAs recorded for a thread.
export function listThreadCheckpointShas(threadId: string): string[] {
  const rows = db
    .select({ checkpointSha: agentTurns.checkpointSha })
    .from(agentTurns)
    .where(eq(agentTurns.threadId, threadId))
    .all();
  return [...new Set(rows.map((r) => r.checkpointSha).filter(Boolean))];
}
