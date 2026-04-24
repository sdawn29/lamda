import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core"

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
  isPinned: integer("is_pinned", { mode: "boolean" }).notNull().default(false),
  lastAccessedAt: integer("last_accessed_at"),
  createdAt: integer("created_at").notNull(),
})

/**
 * Message blocks - stores each message as a complete block with all data.
 * This replaces the old messages table which only stored content as string.
 */
export const messageBlocks = sqliteTable("message_blocks", {
  id: text("id").primaryKey(),
  threadId: text("thread_id")
    .notNull()
    .references(() => threads.id, { onDelete: "cascade" }),
  blockIndex: integer("block_index").notNull(),
  role: text("role", { enum: ["user", "assistant", "tool", "abort"] }).notNull(),
  content: text("content"),
  thinking: text("thinking"),
  model: text("model"),
  provider: text("provider"),
  thinkingLevel: text("thinking_level"),
  responseTime: integer("response_time"),
  errorMessage: text("error_message"),
  toolCallId: text("tool_call_id"),
  toolName: text("tool_name"),
  toolArgs: text("tool_args"),
  toolResult: text("tool_result"),
  toolStatus: text("tool_status", { enum: ["running", "done", "error"] }),
  toolDuration: integer("tool_duration"),
  toolStartTime: integer("tool_start_time"),
  createdAt: integer("created_at").notNull(),
})

export const workspaceFiles = sqliteTable(
  "workspace_files",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    relativePath: text("relative_path").notNull(),
    name: text("name").notNull(),
    isDirectory: integer("is_directory", { mode: "boolean" }).notNull().default(false),
  },
  (table) => [primaryKey({ columns: [table.workspaceId, table.relativePath] })]
)

/**
 * @deprecated Legacy messages table - kept for migration reference
 */
export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  threadId: text("thread_id")
    .notNull()
    .references(() => threads.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant", "tool"] }).notNull(),
  content: text("content").notNull(),
  createdAt: integer("created_at").notNull(),
})
