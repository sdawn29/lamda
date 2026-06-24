import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { existsSync, mkdirSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as schema from "./schema.js";

/** Dimension of memory embedding vectors (Voyage voyage-3.5-lite default). */
export const MEMORY_EMBEDDING_DIM = 1024;

// Whether the sqlite-vec extension loaded and the vector table exists. When
// false, semantic memory retrieval is unavailable and callers fall back to FTS.
let vecAvailable = false;
export function isVecAvailable(): boolean {
  return vecAvailable;
}

const APP_DATA_DIR_NAME = ".lamda";
const LEGACY_APP_DATA_DIR_NAMES = [".lamda-code", ".lambda-code"];
const LEGACY_DB_FILENAME = "db-v2.sqlite";
const DB_FILENAME =
  process.env.NODE_ENV === "development" ? "db-dev.sqlite" : "db.sqlite";

function resolveDbPath(): string {
  const homeDir = homedir();
  const dir = join(homeDir, APP_DATA_DIR_NAME);

  // Migrate legacy directory names (.lamda-code / .lambda-code → .lamda).
  if (!existsSync(dir)) {
    for (const legacyName of LEGACY_APP_DATA_DIR_NAMES) {
      const legacyDir = join(homeDir, legacyName);
      if (existsSync(legacyDir)) {
        try {
          renameSync(legacyDir, dir);
        } catch {
          return join(legacyDir, DB_FILENAME);
        }
        break;
      }
    }
  }

  mkdirSync(dir, { recursive: true });

  const dbPath = join(dir, DB_FILENAME);

  // Migrate legacy db filename (db-v2.sqlite → db.sqlite / db-dev.sqlite).
  const legacyDbPath = join(dir, LEGACY_DB_FILENAME);
  if (!existsSync(dbPath) && existsSync(legacyDbPath)) {
    try {
      renameSync(legacyDbPath, dbPath);
    } catch {
      return legacyDbPath;
    }
  }

  return dbPath;
}

export const dbPath = resolveDbPath();

let sqliteHandle: Database.Database | null = null;

export function closeDb(): void {
  if (sqliteHandle?.open) {
    sqliteHandle.close();
    sqliteHandle = null;
  }
}

function createDb() {
  const sqlite = new Database(dbPath, { timeout: 10000 });
  sqliteHandle = sqlite;

  sqlite.pragma("busy_timeout = 10000");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  // Load sqlite-vec for semantic memory retrieval. Guarded: a build without the
  // native extension simply leaves vecAvailable false and retrieval falls back
  // to FTS keyword search.
  try {
    sqliteVec.load(sqlite);
    vecAvailable = true;
  } catch {
    vecAvailable = false;
  }

  const db = drizzle(sqlite, { schema });

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workspaces (
      id               TEXT PRIMARY KEY,
      name             TEXT NOT NULL,
      path             TEXT NOT NULL,
      open_with_app_id TEXT,
      is_pinned        INTEGER NOT NULL DEFAULT 0,
      icon             TEXT,
      created_at       INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS threads (
      id               TEXT PRIMARY KEY,
      workspace_id     TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      title            TEXT NOT NULL DEFAULT 'New Thread',
      session_file     TEXT,
      model_id         TEXT,
      is_stopped       INTEGER NOT NULL DEFAULT 0,
      is_archived      INTEGER NOT NULL DEFAULT 0,
      is_pinned        INTEGER NOT NULL DEFAULT 0,
      mode             TEXT NOT NULL DEFAULT 'agent',
      last_accessed_at INTEGER,
      owns_worktree_branch INTEGER NOT NULL DEFAULT 0,
      worktree_merge_in_progress INTEGER NOT NULL DEFAULT 0,
      created_at       INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS message_blocks (
      id              TEXT PRIMARY KEY,
      thread_id       TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
      block_index     INTEGER NOT NULL,
      role            TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'tool', 'abort')),
      content         TEXT,
      thinking        TEXT,
      model           TEXT,
      provider        TEXT,
      thinking_level  TEXT,
      response_time   INTEGER,
      error_message   TEXT,
      tool_call_id    TEXT,
      tool_name       TEXT,
      tool_args       TEXT,
      tool_result     TEXT,
      tool_status     TEXT CHECK(tool_status IN ('running', 'done', 'error')),
      tool_duration   INTEGER,
      tool_start_time INTEGER,
      created_at      INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id         TEXT PRIMARY KEY,
      thread_id  TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
      role       TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'tool')),
      content    TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workspace_files (
      workspace_id   TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      relative_path  TEXT NOT NULL,
      name           TEXT NOT NULL,
      is_directory   INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (workspace_id, relative_path)
    );

    CREATE TABLE IF NOT EXISTS workspace_tasks (
      id           TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name         TEXT,
      icon         TEXT,
      command      TEXT NOT NULL,
      created_at   INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS automations (
      id            TEXT PRIMARY KEY,
      workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name          TEXT NOT NULL,
      prompt        TEXT NOT NULL,
      cron          TEXT NOT NULL,
      model_id      TEXT,
      mode          TEXT NOT NULL DEFAULT 'agent',
      approval_mode TEXT NOT NULL DEFAULT 'all_allowed',
      thread_id     TEXT,
      use_worktree  INTEGER NOT NULL DEFAULT 1,
      enabled       INTEGER NOT NULL DEFAULT 1,
      last_run_at   INTEGER,
      last_status   TEXT,
      last_error    TEXT,
      created_at    INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS automation_runs (
      id            TEXT PRIMARY KEY,
      automation_id TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
      thread_id     TEXT,
      started_at    INTEGER NOT NULL,
      finished_at   INTEGER,
      status        TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running', 'ok', 'error')),
      error         TEXT,
      trigger       TEXT NOT NULL DEFAULT 'scheduled' CHECK(trigger IN ('scheduled', 'manual'))
    );

    CREATE TABLE IF NOT EXISTS mcp_servers (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL UNIQUE,
      transport    TEXT NOT NULL DEFAULT 'stdio',
      command      TEXT,
      args         TEXT,
      env          TEXT,
      cwd          TEXT,
      url          TEXT,
      headers      TEXT,
      description  TEXT,
      enabled      INTEGER NOT NULL DEFAULT 1,
      created_at   INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS thread_todo_goals (
      id          TEXT PRIMARY KEY,
      thread_id   TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'completed')),
      sort_order  INTEGER NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS thread_todos (
      id         TEXT PRIMARY KEY,
      thread_id  TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
      goal_id    TEXT,
      content    TEXT NOT NULL,
      status     TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed')),
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_turns (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id      TEXT NOT NULL,
      thread_id       TEXT NOT NULL,
      started_at      INTEGER NOT NULL,
      ended_at        INTEGER NOT NULL,
      checkpoint_sha  TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS ai_usage (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id          TEXT NOT NULL,
      workspace_id       TEXT NOT NULL DEFAULT '',
      provider           TEXT NOT NULL DEFAULT '',
      model              TEXT NOT NULL DEFAULT '',
      input_tokens       INTEGER NOT NULL DEFAULT 0,
      output_tokens      INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens  INTEGER NOT NULL DEFAULT 0,
      cache_write_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens       INTEGER NOT NULL DEFAULT 0,
      cost               REAL NOT NULL DEFAULT 0,
      created_at         INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_turn_files (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      turn_id             INTEGER NOT NULL REFERENCES agent_turns(id) ON DELETE CASCADE,
      file_path           TEXT NOT NULL,
      post_status_code    TEXT NOT NULL,
      pre_status_code     TEXT NOT NULL DEFAULT '',
      pre_content         TEXT,
      was_created_by_turn INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS agent_memories (
      id            TEXT PRIMARY KEY,
      scope         TEXT NOT NULL CHECK(scope IN ('user', 'workspace')),
      workspace_id  TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
      title         TEXT NOT NULL,
      content       TEXT NOT NULL,
      category      TEXT,
      kind          TEXT NOT NULL DEFAULT 'fact' CHECK(kind IN ('fact', 'preference', 'convention', 'decision', 'episode')),
      source        TEXT NOT NULL DEFAULT 'agent' CHECK(source IN ('agent', 'healing', 'user')),
      thread_id     TEXT,
      file_paths    TEXT,
      confidence    REAL NOT NULL DEFAULT 1,
      superseded_by TEXT,
      pinned        INTEGER NOT NULL DEFAULT 0,
      created_at    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL,
      last_used_at  INTEGER,
      use_count     INTEGER NOT NULL DEFAULT 0
    );

    CREATE UNIQUE INDEX IF NOT EXISTS workspaces_path_unique ON workspaces(path);
    CREATE INDEX IF NOT EXISTS threads_workspace_idx ON threads(workspace_id);
    CREATE INDEX IF NOT EXISTS message_blocks_thread_idx ON message_blocks(thread_id, block_index);
    CREATE INDEX IF NOT EXISTS workspace_files_workspace_idx ON workspace_files(workspace_id);
    CREATE INDEX IF NOT EXISTS workspace_tasks_workspace_idx ON workspace_tasks(workspace_id);
    CREATE INDEX IF NOT EXISTS automations_workspace_idx ON automations(workspace_id);
    CREATE INDEX IF NOT EXISTS automation_runs_automation_idx ON automation_runs(automation_id, started_at);
    CREATE INDEX IF NOT EXISTS agent_turns_thread_idx ON agent_turns(thread_id);
    CREATE INDEX IF NOT EXISTS ai_usage_workspace_idx ON ai_usage(workspace_id);
    CREATE INDEX IF NOT EXISTS ai_usage_created_idx ON ai_usage(created_at);
    CREATE INDEX IF NOT EXISTS agent_turn_files_turn_idx ON agent_turn_files(turn_id);
    CREATE INDEX IF NOT EXISTS thread_todo_goals_thread_idx ON thread_todo_goals(thread_id, sort_order, created_at);
    CREATE INDEX IF NOT EXISTS thread_todos_thread_idx ON thread_todos(thread_id, sort_order, created_at);
    CREATE INDEX IF NOT EXISTS thread_todos_goal_idx ON thread_todos(goal_id);
    CREATE INDEX IF NOT EXISTS agent_memories_scope_idx ON agent_memories(scope, workspace_id);
  `);

  // Migration: Add env column to workspaces table.
  try {
    const wsCols = sqlite.prepare("PRAGMA table_info(workspaces)").all() as {
      name: string;
    }[];
    if (!wsCols.some((col) => col.name === "env")) {
      sqlite.exec(`ALTER TABLE workspaces ADD COLUMN env TEXT`);
    }
  } catch {
    // Safe to ignore — column may already exist.
  }

  // Migration: Add is_pinned column to workspaces table.
  try {
    const wsCols = sqlite.prepare("PRAGMA table_info(workspaces)").all() as {
      name: string;
    }[];
    if (!wsCols.some((col) => col.name === "is_pinned")) {
      sqlite.exec(
        `ALTER TABLE workspaces ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0`,
      );
    }
  } catch {
    // Safe to ignore — column may already exist.
  }

  // Migration: Add worktree columns to threads table.
  try {
    const threadCols = sqlite.prepare("PRAGMA table_info(threads)").all() as {
      name: string;
    }[];
    if (!threadCols.some((col) => col.name === "worktree_path")) {
      sqlite.exec(`ALTER TABLE threads ADD COLUMN worktree_path TEXT`);
    }
    if (!threadCols.some((col) => col.name === "worktree_branch")) {
      sqlite.exec(`ALTER TABLE threads ADD COLUMN worktree_branch TEXT`);
    }
    if (!threadCols.some((col) => col.name === "owns_worktree_branch")) {
      sqlite.exec(
        `ALTER TABLE threads ADD COLUMN owns_worktree_branch INTEGER NOT NULL DEFAULT 0`,
      );
    }
    if (!threadCols.some((col) => col.name === "worktree_base_branch")) {
      sqlite.exec(`ALTER TABLE threads ADD COLUMN worktree_base_branch TEXT`);
    }
    if (!threadCols.some((col) => col.name === "worktree_merge_in_progress")) {
      sqlite.exec(
        `ALTER TABLE threads ADD COLUMN worktree_merge_in_progress INTEGER NOT NULL DEFAULT 0`,
      );
    }
    if (!threadCols.some((col) => col.name === "worktree_merge_head_sha")) {
      sqlite.exec(`ALTER TABLE threads ADD COLUMN worktree_merge_head_sha TEXT`);
    }
  } catch {
    // Safe to ignore — columns may already exist.
  }

  // Migration: Add checkpoint_sha column to agent_turns table.
  try {
    const turnCols = sqlite.prepare("PRAGMA table_info(agent_turns)").all() as {
      name: string;
    }[];
    if (!turnCols.some((col) => col.name === "checkpoint_sha")) {
      sqlite.exec(
        `ALTER TABLE agent_turns ADD COLUMN checkpoint_sha TEXT NOT NULL DEFAULT ''`,
      );
    }
  } catch {
    // Safe to ignore — column may already exist.
  }

  // Migration: Add name column to workspace_tasks table.
  try {
    const taskCols = sqlite
      .prepare("PRAGMA table_info(workspace_tasks)")
      .all() as { name: string }[];
    if (!taskCols.some((col) => col.name === "name")) {
      sqlite.exec(`ALTER TABLE workspace_tasks ADD COLUMN name TEXT`);
    }
  } catch {
    // Safe to ignore — column may already exist.
  }

  // Migration: Add forked_from_id column to threads table.
  try {
    const threadCols = sqlite.prepare("PRAGMA table_info(threads)").all() as {
      name: string;
    }[];
    if (!threadCols.some((col) => col.name === "forked_from_id")) {
      sqlite.exec(`ALTER TABLE threads ADD COLUMN forked_from_id TEXT`);
    }
  } catch {
    // Safe to ignore — column may already exist.
  }

  // Migration: Add base_checkpoint_sha column to threads table (fork snapshot).
  try {
    const threadCols = sqlite.prepare("PRAGMA table_info(threads)").all() as {
      name: string;
    }[];
    if (!threadCols.some((col) => col.name === "base_checkpoint_sha")) {
      sqlite.exec(`ALTER TABLE threads ADD COLUMN base_checkpoint_sha TEXT`);
    }
  } catch {
    // Safe to ignore — column may already exist.
  }

  // Migration: Add mode column to threads table.
  try {
    const threadCols = sqlite.prepare("PRAGMA table_info(threads)").all() as {
      name: string;
    }[];
    if (!threadCols.some((col) => col.name === "mode")) {
      sqlite.exec(
        `ALTER TABLE threads ADD COLUMN mode TEXT NOT NULL DEFAULT 'agent'`,
      );
    }
    sqlite.exec(`UPDATE threads SET mode = 'agent' WHERE mode = 'code'`);
  } catch {
    // Safe to ignore — column may already exist.
  }

  // Migration: Add approval_mode column to threads table (tool-approval gating).
  try {
    const threadCols = sqlite.prepare("PRAGMA table_info(threads)").all() as {
      name: string;
    }[];
    if (!threadCols.some((col) => col.name === "approval_mode")) {
      sqlite.exec(
        `ALTER TABLE threads ADD COLUMN approval_mode TEXT NOT NULL DEFAULT 'ask'`,
      );
    }
  } catch {
    // Safe to ignore — column may already exist.
  }

  // Migration: Add last_reflected_at column to threads (memory-reflection watermark).
  try {
    const threadCols = sqlite.prepare("PRAGMA table_info(threads)").all() as {
      name: string;
    }[];
    if (!threadCols.some((col) => col.name === "last_reflected_at")) {
      sqlite.exec(`ALTER TABLE threads ADD COLUMN last_reflected_at INTEGER`);
    }
  } catch {
    // Safe to ignore — column may already exist.
  }

  // Migration: Update message_blocks CHECK constraint to include 'abort' and 'compaction' roles.
  // SQLite doesn't support ALTER TABLE for CHECK constraints, so we recreate the table when needed.
  try {
    const result = sqlite
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='message_blocks'",
      )
      .get() as { sql: string } | undefined;
    if (result && !result.sql.includes("'compaction'")) {
      const columns = [
        "id",
        "thread_id",
        "block_index",
        "role",
        "content",
        "thinking",
        "model",
        "provider",
        "thinking_level",
        "response_time",
        "error_message",
        "tool_call_id",
        "tool_name",
        "tool_args",
        "tool_result",
        "tool_status",
        "tool_duration",
        "tool_start_time",
        "created_at",
      ];
      const colList = columns.join(", ");
      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS message_blocks_new (
          id              TEXT PRIMARY KEY,
          thread_id       TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
          block_index     INTEGER NOT NULL,
          role            TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'tool', 'abort', 'compaction')),
          content         TEXT,
          thinking        TEXT,
          model           TEXT,
          provider        TEXT,
          thinking_level  TEXT,
          response_time   INTEGER,
          error_message   TEXT,
          tool_call_id    TEXT,
          tool_name       TEXT,
          tool_args       TEXT,
          tool_result     TEXT,
          tool_status     TEXT CHECK(tool_status IN ('running', 'done', 'error')),
          tool_duration   INTEGER,
          tool_start_time INTEGER,
          created_at      INTEGER NOT NULL
        );
        INSERT INTO message_blocks_new (${colList}) SELECT ${colList} FROM message_blocks;
        DROP TABLE message_blocks;
        ALTER TABLE message_blocks_new RENAME TO message_blocks;
      `);
    }
  } catch (e) {
    // Migration may fail if table already has correct schema or on first run — safe to ignore.
  }

  // Migration: Add goal_id column to thread_todos table.
  try {
    const todoCols = sqlite
      .prepare("PRAGMA table_info(thread_todos)")
      .all() as { name: string }[];
    if (!todoCols.some((col) => col.name === "goal_id")) {
      sqlite.exec(`ALTER TABLE thread_todos ADD COLUMN goal_id TEXT`);
    }
  } catch {
    // Safe to ignore — column may already exist or table doesn't exist yet.
  }

  // Migration: Add icon column to workspaces table.
  try {
    const wsCols = sqlite.prepare("PRAGMA table_info(workspaces)").all() as {
      name: string;
    }[];
    if (!wsCols.some((col) => col.name === "icon")) {
      sqlite.exec(`ALTER TABLE workspaces ADD COLUMN icon TEXT`);
    }
  } catch {
    // Safe to ignore — column may already exist.
  }

  // Migration: MCP servers are now scoped application-wide instead of
  // per-workspace. Drop the workspace_id column and deduplicate by name,
  // keeping the most recently created server for any duplicated name.
  try {
    const mcpCols = sqlite.prepare("PRAGMA table_info(mcp_servers)").all() as {
      name: string;
    }[];
    if (mcpCols.some((col) => col.name === "workspace_id")) {
      sqlite.exec(`
        DROP INDEX IF EXISTS mcp_servers_workspace_idx;

        CREATE TABLE mcp_servers_new (
          id           TEXT PRIMARY KEY,
          name         TEXT NOT NULL UNIQUE,
          command      TEXT NOT NULL,
          args         TEXT,
          env          TEXT,
          cwd          TEXT,
          description  TEXT,
          enabled      INTEGER NOT NULL DEFAULT 1,
          created_at   INTEGER NOT NULL
        );

        INSERT INTO mcp_servers_new (id, name, command, args, env, cwd, description, enabled, created_at)
        SELECT id, name, command, args, env, cwd, description, enabled, created_at
        FROM mcp_servers
        WHERE id IN (
          SELECT id FROM mcp_servers AS m
          WHERE created_at = (SELECT MAX(created_at) FROM mcp_servers WHERE name = m.name)
          GROUP BY name
        );

        DROP TABLE mcp_servers;
        ALTER TABLE mcp_servers_new RENAME TO mcp_servers;
      `);
    }
  } catch (e) {
    // Migration may fail on first run or if already migrated — safe to ignore.
  }

  // Migration: Add HTTP/SSE transport support to mcp_servers. Adds transport/
  // url/headers columns and relaxes command to nullable (remote servers have no
  // command). SQLite can't drop a NOT NULL constraint via ALTER, so when the new
  // `transport` column is absent we recreate the table preserving existing rows
  // (all pre-existing rows are stdio servers with a command).
  try {
    const mcpCols = sqlite.prepare("PRAGMA table_info(mcp_servers)").all() as {
      name: string;
    }[];
    if (
      mcpCols.length > 0 &&
      !mcpCols.some((col) => col.name === "transport")
    ) {
      sqlite.exec(`
        CREATE TABLE mcp_servers_new (
          id           TEXT PRIMARY KEY,
          name         TEXT NOT NULL UNIQUE,
          transport    TEXT NOT NULL DEFAULT 'stdio',
          command      TEXT,
          args         TEXT,
          env          TEXT,
          cwd          TEXT,
          url          TEXT,
          headers      TEXT,
          description  TEXT,
          enabled      INTEGER NOT NULL DEFAULT 1,
          created_at   INTEGER NOT NULL
        );

        INSERT INTO mcp_servers_new (id, name, transport, command, args, env, cwd, description, enabled, created_at)
        SELECT id, name, 'stdio', command, args, env, cwd, description, enabled, created_at
        FROM mcp_servers;

        DROP TABLE mcp_servers;
        ALTER TABLE mcp_servers_new RENAME TO mcp_servers;
      `);
    }
  } catch (e) {
    // Migration may fail on first run or if already migrated — safe to ignore.
  }

  // Migration: Add pinned column to agent_memories table (always-on core set).
  try {
    const memCols = sqlite
      .prepare("PRAGMA table_info(agent_memories)")
      .all() as { name: string }[];
    if (!memCols.some((col) => col.name === "pinned")) {
      sqlite.exec(
        `ALTER TABLE agent_memories ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0`,
      );
    }
  } catch {
    // Safe to ignore — column may already exist.
  }

  // Migration: Add kind/thread_id/file_paths/confidence/superseded_by columns to
  // agent_memories (taxonomy + episodic links + reinforcement). Each guarded so a
  // partially-migrated DB still converges.
  try {
    const memCols = sqlite
      .prepare("PRAGMA table_info(agent_memories)")
      .all() as { name: string }[];
    const has = (name: string) => memCols.some((col) => col.name === name);
    if (!has("kind")) {
      sqlite.exec(
        `ALTER TABLE agent_memories ADD COLUMN kind TEXT NOT NULL DEFAULT 'fact' CHECK(kind IN ('fact', 'preference', 'convention', 'decision', 'episode'))`,
      );
    }
    if (!has("thread_id")) {
      sqlite.exec(`ALTER TABLE agent_memories ADD COLUMN thread_id TEXT`);
    }
    if (!has("file_paths")) {
      sqlite.exec(`ALTER TABLE agent_memories ADD COLUMN file_paths TEXT`);
    }
    if (!has("confidence")) {
      sqlite.exec(
        `ALTER TABLE agent_memories ADD COLUMN confidence REAL NOT NULL DEFAULT 1`,
      );
    }
    if (!has("superseded_by")) {
      sqlite.exec(`ALTER TABLE agent_memories ADD COLUMN superseded_by TEXT`);
    }
  } catch {
    // Safe to ignore — columns may already exist.
  }

  // Migration: Add attachments column to message_blocks table for persisting file attachments.
  try {
    const msgBlockCols = sqlite
      .prepare("PRAGMA table_info(message_blocks)")
      .all() as { name: string }[];
    if (!msgBlockCols.some((col) => col.name === "attachments")) {
      sqlite.exec(`ALTER TABLE message_blocks ADD COLUMN attachments TEXT`);
    }
  } catch {
    // Safe to ignore — column may already exist.
  }

  // Memory retrieval: FTS5 index over agent_memories for BM25-ranked retrieval,
  // kept in sync with the base table by triggers. Guarded so the app still runs
  // on a SQLite build without FTS5 — callers fall back to LIKE search.
  try {
    sqlite.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS agent_memories_fts USING fts5(
        id UNINDEXED, title, content, category, tokenize = 'unicode61'
      );

      CREATE TRIGGER IF NOT EXISTS agent_memories_fts_ai AFTER INSERT ON agent_memories BEGIN
        INSERT INTO agent_memories_fts(id, title, content, category)
        VALUES (new.id, new.title, new.content, coalesce(new.category, ''));
      END;

      CREATE TRIGGER IF NOT EXISTS agent_memories_fts_ad AFTER DELETE ON agent_memories BEGIN
        DELETE FROM agent_memories_fts WHERE id = old.id;
      END;

      CREATE TRIGGER IF NOT EXISTS agent_memories_fts_au AFTER UPDATE ON agent_memories BEGIN
        UPDATE agent_memories_fts
        SET title = new.title, content = new.content, category = coalesce(new.category, '')
        WHERE id = old.id;
      END;
    `);
    // Backfill any rows that predate the FTS index (or a failed earlier attempt).
    sqlite.exec(`
      INSERT INTO agent_memories_fts(id, title, content, category)
      SELECT id, title, content, coalesce(category, '')
      FROM agent_memories
      WHERE id NOT IN (SELECT id FROM agent_memories_fts);
    `);
  } catch {
    // FTS5 unavailable — memory retrieval falls back to LIKE search.
  }

  // Memory retrieval: vec0 virtual table holding one embedding per memory,
  // keyed by the memory id, for semantic KNN search. Rows are populated
  // asynchronously by the embedding backfill (Voyage), so an empty table just
  // means no semantic hits yet — never an error. Unlike FTS we cannot keep this
  // in sync via triggers (vec0 isn't writable from a trigger), so the embedding
  // service deletes/upserts vectors alongside memory writes.
  if (vecAvailable) {
    try {
      sqlite.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS agent_memories_vec USING vec0(
          id TEXT PRIMARY KEY,
          embedding float[${MEMORY_EMBEDDING_DIM}]
        );
      `);
    } catch {
      // vec0 unavailable despite the extension loading — disable semantic search.
      vecAvailable = false;
    }
  }

  return db;
}

export const db = createDb();
export type Db = typeof db;
