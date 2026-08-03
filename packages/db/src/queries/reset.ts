import { sql } from "drizzle-orm";
import { db } from "../client.js";

/**
 * Every table the app writes user data into, ordered children-before-parents so
 * the deletes stay valid even with `foreign_keys = ON`. Kept explicit rather
 * than derived from `sqlite_master` because vec0 virtual tables own private
 * shadow tables (`*_chunks`, `*_rowids`, `*_info`) that must never be written
 * to directly — deleting from them corrupts the index.
 *
 * When a new table is added to `schema.ts`, add it here too, or "Delete all
 * data" will silently leave its rows behind.
 */
const DATA_TABLES = [
  // Search indexes first — FTS mirrors are trigger-synced, but the vec0 tables
  // are not (vec0 can't be written from a trigger), so stale embeddings would
  // otherwise survive the reset and pollute retrieval.
  "agent_memories_vec",
  "code_chunks_vec",
  "agent_memories_fts",
  "code_chunks_fts",
  // Leaves
  "automation_runs",
  "agent_turn_files",
  "agent_turns",
  "thread_todos",
  "thread_todo_goals",
  "message_blocks",
  "messages",
  "checkpoints",
  "ai_usage",
  "code_chunks",
  "code_files",
  "workspace_files",
  "workspace_tasks",
  "agent_memories",
  "automations",
  "mcp_servers",
  "threads",
  "workspaces",
  "settings",
] as const;

function tableExists(name: string): boolean {
  const rows = db.all<{ name: string }>(
    sql`SELECT name FROM sqlite_master WHERE name = ${name}`,
  );
  return rows.length > 0;
}

/**
 * Wipe every row of application data — workspaces, threads, messages, agent
 * memories, usage, automations, MCP servers, code index, and settings — leaving
 * an empty database with its schema intact. Backs the "Delete all data" reset.
 *
 * The schema is deliberately preserved: the server holds the SQLite connection
 * open, so recreating the file underneath it would break the live handle.
 */
export function resetDatabase(): void {
  const present = DATA_TABLES.filter((table) => tableExists(table));

  db.run(sql`PRAGMA foreign_keys = OFF`);
  try {
    for (const table of present) {
      db.run(sql.raw(`DELETE FROM ${table}`));
    }
    // Drizzle/better-sqlite3 keeps no autoincrement counters we rely on, but
    // clearing sqlite_sequence (when present) makes the reset a true fresh start.
    if (tableExists("sqlite_sequence")) {
      db.run(sql`DELETE FROM sqlite_sequence`);
    }
  } finally {
    db.run(sql`PRAGMA foreign_keys = ON`);
  }

  // Reclaim the freed pages so a reset actually shrinks the file on disk.
  // Must run outside a transaction; best-effort since a busy database can
  // refuse it and an oversized file is not a reason to fail the reset.
  try {
    db.run(sql`VACUUM`);
  } catch {
    // ignore
  }
}
