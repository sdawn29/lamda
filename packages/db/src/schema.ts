import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
})

export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  path: text("path").notNull(),
  openWithAppId: text("open_with_app_id"),
  createdAt: integer("created_at").notNull(),
})

export const threads = sqliteTable("threads", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("New Thread"),
  sessionFile: text("session_file"),
  modelId: text("model_id"),
  isStopped: integer("is_stopped", { mode: "boolean" }).notNull().default(false),
  isArchived: integer("is_archived", { mode: "boolean" }).notNull().default(false),
  lastAccessedAt: integer("last_accessed_at"),
  createdAt: integer("created_at").notNull(),
})

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  threadId: text("thread_id")
    .notNull()
    .references(() => threads.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant", "tool"] }).notNull(),
  content: text("content").notNull(),
  createdAt: integer("created_at").notNull(),
})
