import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { existsSync, mkdirSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as schema from "./schema.js";

const APP_DATA_DIR_NAME = ".lamda-code";
const LEGACY_APP_DATA_DIR_NAME = ".lambda-code";
const DB_FILENAME = "db-v2.sqlite";

function resolveDbPath(): string {
  const homeDir = homedir();
  const dir = join(homeDir, APP_DATA_DIR_NAME);
  const legacyDir = join(homeDir, LEGACY_APP_DATA_DIR_NAME);

  if (!existsSync(dir) && existsSync(legacyDir)) {
    try {
      renameSync(legacyDir, dir);
    } catch {
      return join(legacyDir, DB_FILENAME);
    }
  }

  mkdirSync(dir, { recursive: true });
  return join(dir, DB_FILENAME);
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
      last_accessed_at INTEGER,
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

    CREATE UNIQUE INDEX IF NOT EXISTS workspaces_path_unique ON workspaces(path);
    CREATE INDEX IF NOT EXISTS message_blocks_thread_idx ON message_blocks(thread_id, block_index);
    CREATE INDEX IF NOT EXISTS workspace_files_workspace_idx ON workspace_files(workspace_id);
  `);

  // Migration: Update message_blocks CHECK constraint to include 'abort' role
  // SQLite doesn't support ALTER TABLE for CHECK constraints, so we need to recreate
  try {
    const result = sqlite.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='message_blocks'").get() as { sql: string } | undefined;
    if (result && !result.sql.includes("'abort'")) {
      // Check constraint doesn't include 'abort', need to migrate
      const columns = [
        'id', 'thread_id', 'block_index', 'role', 'content', 'thinking',
        'model', 'provider', 'thinking_level', 'response_time', 'error_message',
        'tool_call_id', 'tool_name', 'tool_args', 'tool_result', 'tool_status',
        'tool_duration', 'tool_start_time', 'created_at'
      ];
      const colList = columns.join(', ');
      
      // Create new table with updated constraint
      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS message_blocks_new (
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
        INSERT INTO message_blocks_new (${colList}) SELECT ${colList} FROM message_blocks;
        DROP TABLE message_blocks;
        ALTER TABLE message_blocks_new RENAME TO message_blocks;
      `);
    }
  } catch (e) {
    // Migration may fail if table already has correct schema or on first run
    // This is expected and safe to ignore
  }

  return db;
}

export const db = createDb();
export type Db = typeof db;
