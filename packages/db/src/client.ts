import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { mkdirSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import * as schema from "./schema.js"

function resolveDbPath(): string {
  const dir = join(homedir(), ".lambda-code")
  mkdirSync(dir, { recursive: true })
  return join(dir, "db.sqlite")
}

function createDb() {
  const sqlite = new Database(resolveDbPath())

  sqlite.pragma("journal_mode = WAL")
  sqlite.pragma("foreign_keys = ON")

  const db = drizzle(sqlite, { schema })

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      path       TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS threads (
      id           TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      title        TEXT NOT NULL DEFAULT 'New Thread',
      session_file TEXT,
      created_at   INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id         TEXT PRIMARY KEY,
      thread_id  TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
      role       TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'tool')),
      content    TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `)

  // Migrate existing databases that predate the session_file column
  try {
    sqlite.exec("ALTER TABLE threads ADD COLUMN session_file TEXT")
  } catch {
    // Column already exists — nothing to do
  }

  return db
}

export const db = createDb()
export type Db = typeof db
