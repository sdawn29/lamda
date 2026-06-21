import {
  sqliteTable,
  text,
  integer,
  real,
  primaryKey,
} from "drizzle-orm/sqlite-core";

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  path: text("path").notNull(),
  openWithAppId: text("open_with_app_id"),
  isPinned: integer("is_pinned", { mode: "boolean" }).notNull().default(false),
  env: text("env"), // JSON object: { KEY: "value" }
  icon: text("icon"), // relative path to detected icon file (e.g. "public/favicon.ico")
  createdAt: integer("created_at").notNull(),
});

export const threads = sqliteTable("threads", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("New Thread"),
  sessionFile: text("session_file"),
  modelId: text("model_id"),
  isStopped: integer("is_stopped", { mode: "boolean" })
    .notNull()
    .default(false),
  isArchived: integer("is_archived", { mode: "boolean" })
    .notNull()
    .default(false),
  isPinned: integer("is_pinned", { mode: "boolean" }).notNull().default(false),
  mode: text("mode", { enum: ["ask", "plan", "agent"] })
    .notNull()
    .default("agent"),
  approvalMode: text("approval_mode", {
    enum: ["ask", "edits_allowed", "all_allowed"],
  })
    .notNull()
    .default("ask"),
  lastAccessedAt: integer("last_accessed_at"),
  // Epoch ms of the last memory-reflection pass over this thread. Reflection
  // only mines message blocks created after this watermark, so frequent passes
  // (per-N-turns, idle, shutdown) stay cheap and don't re-scan old transcript.
  lastReflectedAt: integer("last_reflected_at"),
  createdAt: integer("created_at").notNull(),
  forkedFromId: text("forked_from_id"),
  // Durable checkpoint SHA capturing the working-tree state when this thread was
  // forked, so the branch's divergence point survives independently of the
  // parent's turn checkpoints. Null for non-forked threads.
  baseCheckpointSha: text("base_checkpoint_sha"),
  // When set, this thread runs inside a git worktree at this absolute path
  // (under ~/.lamda/worktrees/<workspace-name>/<worktree-name>) on branch
  // `worktreeBranch`, instead of the workspace's own directory. Null = local.
  worktreePath: text("worktree_path"),
  worktreeBranch: text("worktree_branch"),
  // Branch in the main workspace checkout that this worktree must merge into.
  // Persisting it prevents a later local checkout from silently changing the
  // merge destination.
  worktreeBaseBranch: text("worktree_base_branch"),
  // True when lamda created the worktree branch and should delete it after a
  // successful merge. False for pre-existing worktrees entered by the thread.
  ownsWorktreeBranch: integer("owns_worktree_branch", {
    mode: "boolean",
  })
    .notNull()
    .default(false),
  // Only one thread per workspace may own the main checkout's active merge.
  // This flag survives renderer/server reloads so conflict resolution cannot be
  // continued or aborted through a different thread.
  worktreeMergeInProgress: integer("worktree_merge_in_progress", {
    mode: "boolean",
  })
    .notNull()
    .default(false),
  // Exact MERGE_HEAD claimed by this thread. This remains stable even if the
  // worktree branch advances while conflicts are being resolved.
  worktreeMergeHeadSha: text("worktree_merge_head_sha"),
});

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
  role: text("role", {
    enum: ["user", "assistant", "tool", "abort", "compaction"],
  }).notNull(),
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
  attachments: text("attachments"), // JSON array of attachment metadata
  createdAt: integer("created_at").notNull(),
});

export const workspaceFiles = sqliteTable(
  "workspace_files",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    relativePath: text("relative_path").notNull(),
    name: text("name").notNull(),
    isDirectory: integer("is_directory", { mode: "boolean" })
      .notNull()
      .default(false),
  },
  (table) => [primaryKey({ columns: [table.workspaceId, table.relativePath] })],
);

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
});

// ── Agent Turns ───────────────────────────────────────────────────────────────

export const agentTurns = sqliteTable("agent_turns", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: text("session_id").notNull(),
  threadId: text("thread_id").notNull(),
  startedAt: integer("started_at").notNull(),
  endedAt: integer("ended_at").notNull(),
  checkpointSha: text("checkpoint_sha").notNull().default(""),
});

export const agentTurnFiles = sqliteTable("agent_turn_files", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  turnId: integer("turn_id").notNull(),
  filePath: text("file_path").notNull(),
  postStatusCode: text("post_status_code").notNull(),
  preStatusCode: text("pre_status_code").notNull().default(""),
  preContent: text("pre_content"),
  wasCreatedByTurn: integer("was_created_by_turn", { mode: "boolean" })
    .notNull()
    .default(false),
});

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
});

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
});

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
});

// ── Agent Memories ────────────────────────────────────────────────────────────

/**
 * Durable facts the agent has learned. `user` scope applies to every workspace;
 * `workspace` scope is tied to one workspace and cascades away with it.
 */
export const agentMemories = sqliteTable("agent_memories", {
  id: text("id").primaryKey(),
  scope: text("scope", { enum: ["user", "workspace"] }).notNull(),
  workspaceId: text("workspace_id").references(() => workspaces.id, {
    onDelete: "cascade",
  }),
  title: text("title").notNull(),
  content: text("content").notNull(),
  category: text("category"),
  // What kind of memory this is. `fact` is the original flat-fact behaviour and
  // the default; the others let retrieval and rendering treat memories
  // differently (preferences always-on, episodes/decisions linked to a thread).
  kind: text("kind", {
    enum: ["fact", "preference", "convention", "decision", "episode"],
  })
    .notNull()
    .default("fact"),
  source: text("source", { enum: ["agent", "healing", "user"] })
    .notNull()
    .default("agent"),
  // Provenance + episodic link: the thread this memory was learned from. Nulled
  // (not cascaded) when the thread is deleted, so the learning survives.
  threadId: text("thread_id").references(() => threads.id, {
    onDelete: "set null",
  }),
  // JSON array of file paths this memory concerns (touched/affected), enabling
  // file-association retrieval when the agent re-enters that area of the code.
  filePaths: text("file_paths"),
  // Reinforcement score. Bumped when a memory is re-observed; lowered when it is
  // superseded. Feeds retrieval ranking and garbage collection.
  confidence: real("confidence").notNull().default(1),
  // When this memory is contradicted by a newer one, the newer memory's id is
  // recorded here rather than deleting the row (auditable supersession).
  supersededBy: text("superseded_by"),
  // Pinned memories form the always-on "core" injected into every session,
  // regardless of relevance to the current prompt.
  pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  lastUsedAt: integer("last_used_at"),
  useCount: integer("use_count").notNull().default(0),
});

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
});

export const mcpServers = sqliteTable("mcp_servers", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  // Transport: "stdio" (local process) | "http" (Streamable HTTP) | "sse" (legacy).
  transport: text("transport", { enum: ["stdio", "http", "sse"] })
    .notNull()
    .default("stdio"),
  command: text("command"), // stdio only
  args: text("args"), // JSON array stored as string — stdio only
  env: text("env"), // JSON object stored as string — stdio only
  cwd: text("cwd"), // stdio only
  url: text("url"), // http/sse only
  headers: text("headers"), // JSON object stored as string — http/sse only
  description: text("description"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").notNull(),
});
