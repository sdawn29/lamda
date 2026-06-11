import { sqliteTable, text, integer, real, primaryKey } from "drizzle-orm/sqlite-core"

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
})

export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  path: text("path").notNull(),
  openWithAppId: text("open_with_app_id"),
  isPinned: integer("is_pinned", { mode: "boolean" }).notNull().default(false),
  env: text("env"), // JSON object: { KEY: "value" }
  icon: text("icon"), // relative path to detected icon file (e.g. "public/favicon.ico")
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
  mode: text("mode", { enum: ["ask", "plan", "agent"] }).notNull().default("agent"),
  lastAccessedAt: integer("last_accessed_at"),
  createdAt: integer("created_at").notNull(),
  forkedFromId: text("forked_from_id"),
  // Durable checkpoint SHA capturing the working-tree state when this thread was
  // forked, so the branch's divergence point survives independently of the
  // parent's turn checkpoints. Null for non-forked threads.
  baseCheckpointSha: text("base_checkpoint_sha"),
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
  role: text("role", { enum: ["user", "assistant", "tool", "abort", "compaction"] }).notNull(),
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

// ── Agent Turns ───────────────────────────────────────────────────────────────

export const agentTurns = sqliteTable("agent_turns", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: text("session_id").notNull(),
  threadId: text("thread_id").notNull(),
  startedAt: integer("started_at").notNull(),
  endedAt: integer("ended_at").notNull(),
  checkpointSha: text("checkpoint_sha").notNull().default(""),
})

export const agentTurnFiles = sqliteTable("agent_turn_files", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  turnId: integer("turn_id").notNull(),
  filePath: text("file_path").notNull(),
  postStatusCode: text("post_status_code").notNull(),
  preStatusCode: text("pre_status_code").notNull().default(""),
  preContent: text("pre_content"),
  wasCreatedByTurn: integer("was_created_by_turn", { mode: "boolean" }).notNull().default(false),
})

// ── Thread Todo Goals ─────────────────────────────────────────────────────────

export const threadTodoGoals = sqliteTable("thread_todo_goals", {
  id: text("id").primaryKey(),
  threadId: text("thread_id")
    .notNull()
    .references(() => threads.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  status: text("status", { enum: ["active", "completed"] })
    .notNull()
    .default("active"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at").notNull(),
})

// ── Thread Todos ──────────────────────────────────────────────────────────────

export const threadTodos = sqliteTable("thread_todos", {
  id: text("id").primaryKey(),
  threadId: text("thread_id")
    .notNull()
    .references(() => threads.id, { onDelete: "cascade" }),
  /** Nullable for legacy rows; always set for new rows. */
  goalId: text("goal_id"),
  content: text("content").notNull(),
  status: text("status", { enum: ["pending", "in_progress", "completed"] })
    .notNull()
    .default("pending"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at").notNull(),
})

// ── AI Usage ──────────────────────────────────────────────────────────────────

/**
 * One row per completed LLM response. thread_id/workspace_id are intentionally
 * not foreign keys so usage history survives thread/workspace deletion —
 * readers join workspaces/threads with a LEFT JOIN for display names.
 */
export const aiUsage = sqliteTable("ai_usage", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  threadId: text("thread_id").notNull(),
  workspaceId: text("workspace_id").notNull().default(""),
  provider: text("provider").notNull().default(""),
  model: text("model").notNull().default(""),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
  cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
  totalTokens: integer("total_tokens").notNull().default(0),
  cost: real("cost").notNull().default(0),
  createdAt: integer("created_at").notNull(),
})

// ── MCP Servers ───────────────────────────────────────────────────────────────

export const workspaceTasks = sqliteTable("workspace_tasks", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name"),
  icon: text("icon"),
  command: text("command").notNull(),
  createdAt: integer("created_at").notNull(),
})

export const mcpServers = sqliteTable("mcp_servers", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  command: text("command").notNull(),
  args: text("args"), // JSON array stored as string
  env: text("env"), // JSON object stored as string
  cwd: text("cwd"),
  description: text("description"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").notNull(),
})
