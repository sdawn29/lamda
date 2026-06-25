import {
  createManagedSession,
  openManagedSession,
  createPlanModeTools,
  createTodoTool,
  createMemoryTool,
  createQuestionTool,
  normalizeMode,
  getModeConfig,
  PLAN_DIR,
  type SdkConfig,
  type ManagedSessionHandle,
} from "@lamda/pi-sdk";
import {
  updateThreadSessionFile,
  getWorkspace,
  getThread,
  clearThreadWorktree,
} from "@lamda/db";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { store } from "../store.js";
import { sessionEvents } from "../session-events.js";
import { waitForAnswer } from "./question-registry.js";
import { createToolApprovalBridge } from "./tool-approval-bridge.js";
import { createAutomationTool } from "./automation-tool.js";
import { worktreeWatcher } from "./worktree-watcher.js";
import { worktreeBroadcaster } from "../worktree-broadcaster.js";

// The `question` tool is host-driven and stateless across sessions, so a
// single instance can be shared by every session. It blocks on the question
// registry until the user answers in the UI.
const questionTool = createQuestionTool(waitForAnswer);

async function buildSessionCustomTools(
  threadId: string,
  cwd: string,
  workspaceId?: string,
) {
  const thread = getThread(threadId);
  const mode = normalizeMode(thread?.mode);
  // The question tool is available in every mode so the agent can always pause
  // to ask the user a blocking multiple-choice question.
  const customTools = workspaceId
    ? await collectCustomTools(workspaceId, cwd, mode, threadId)
    : mode === "plan"
      ? [...createPlanModeTools(cwd), questionTool]
      : mode === "ask"
        ? [questionTool]
        : [createTodoTool(threadId), createMemoryTool(undefined), questionTool];

  return { customTools, mode };
}

function modelConfigForThread(
  threadId: string,
): Pick<SdkConfig, "provider" | "model"> {
  const modelId = getThread(threadId)?.modelId;
  if (!modelId) return {};
  const separator = modelId.indexOf("::");
  if (separator <= 0 || separator === modelId.length - 2) return {};
  return {
    provider: modelId.slice(0, separator),
    model: modelId.slice(separator + 2),
  };
}

async function createHandleForThread(
  threadId: string,
  cwd: string,
  workspaceId?: string,
  opts: Omit<Partial<SdkConfig>, "cwd"> = {},
): Promise<ManagedSessionHandle> {
  const { customTools, mode } = await buildSessionCustomTools(
    threadId,
    cwd,
    workspaceId,
  );
  return createManagedSession({
    cwd,
    customTools,
    mode,
    toolApproval: createToolApprovalBridge(threadId),
    ...modelConfigForThread(threadId),
    ...opts,
  });
}

export async function createSessionForThread(
  threadId: string,
  cwd: string,
  workspaceId?: string,
  opts: Omit<Partial<SdkConfig>, "cwd"> = {},
): Promise<string> {
  // Inject workspace-scoped env vars into process.env so they are inherited
  // by any child processes (e.g. bash tool) that Claude spawns during the session.
  if (workspaceId) {
    const ws = getWorkspace(workspaceId);
    if (ws?.env) {
      try {
        const envVars = JSON.parse(ws.env) as Record<string, string>;
        for (const [key, value] of Object.entries(envVars)) {
          if (key && value !== undefined) process.env[key] = String(value);
        }
      } catch {
        /* ignore malformed JSON */
      }
    }
  }

  // Pre-create the plan dir so the agent's first write in plan mode never fails
  // on a missing directory. Cheap and safe to run unconditionally.
  await mkdir(join(cwd, PLAN_DIR), { recursive: true }).catch(() => {});

  const handle = await createHandleForThread(threadId, cwd, workspaceId, opts);
  const sessionId = store.create(handle, cwd, threadId, workspaceId);

  if (handle.sessionFile) {
    updateThreadSessionFile(threadId, handle.sessionFile);
  }

  // Start the event hub immediately so we capture tool_execution_start events
  const entry = store.get(sessionId);
  if (entry) {
    sessionEvents.ensure(sessionId, entry.threadId, entry.handle, entry.cwd);
  }

  // Watch the worktree (if this session runs in one) so an out-of-band removal
  // relocates the session instantly instead of failing a tool call.
  refreshWorktreeWatch(sessionId);

  return sessionId;
}

export async function openSessionForThread(
  threadId: string,
  sessionFilePath: string,
  cwd: string,
  workspaceId?: string,
  opts: Omit<Partial<SdkConfig>, "cwd" | "mode" | "customTools"> = {},
) {
  const { customTools, mode } = await buildSessionCustomTools(
    threadId,
    cwd,
    workspaceId,
  );
  return openManagedSession(sessionFilePath, {
    cwd,
    customTools,
    mode,
    toolApproval: createToolApprovalBridge(threadId),
    ...opts,
  });
}

export function ensureSessionEventHub(
  sessionId: string,
  entry: NonNullable<ReturnType<typeof store.get>>,
) {
  return sessionEvents.ensure(
    sessionId,
    entry.threadId,
    entry.handle,
    entry.cwd,
  );
}

export function gitCwd(id: string): string | null {
  return store.getCwd(id) ?? null;
}

/**
 * The directory a thread's session runs in: its git worktree when one is
 * attached AND still on disk, otherwise the workspace's own path.
 *
 * A worktree can disappear out-of-band (removed in a terminal, pruned, or a
 * partially-failed merge/detach) while the DB still records its path. Running a
 * session there makes every agent tool call resolve against a phantom directory
 * and fail with ENOENT, so we treat a missing worktree as detached: clear the
 * stale DB state and fall back to the workspace. Mirrors the startup guard in
 * bootstrap.ts so the renderer, terminal, and next restart all agree.
 */
export function resolveThreadCwd(
  thread: { id?: string; worktreePath?: string | null } | null | undefined,
  workspacePath: string,
): string {
  if (thread?.worktreePath) {
    if (existsSync(thread.worktreePath)) return thread.worktreePath;
    if (thread.id) clearThreadWorktree(thread.id);
  }
  return workspacePath;
}

/**
 * Self-heals a live session whose working directory has vanished from disk
 * (e.g. its git worktree was removed after the session started). Moves the
 * running runtime back to the workspace directory and persistently detaches the
 * worktree, so subsequent tool calls stop failing with ENOENT. No-op when the
 * cwd still exists or there's no safe fallback.
 *
 * Driven proactively by {@link worktreeWatcher} the instant the worktree dir
 * disappears, and also called before each prompt as a backstop (e.g. when the
 * removal happened while the server was down).
 */
export async function healStaleWorktreeCwd(sessionId: string): Promise<void> {
  const entry = store.get(sessionId);
  if (!entry || existsSync(entry.cwd)) return;

  const ws = entry.workspaceId ? getWorkspace(entry.workspaceId) : null;
  if (!ws?.path || !existsSync(ws.path)) return;

  const { threadId, workspaceId } = entry;
  // Detach in the DB first so any concurrent cwd lookup already sees the
  // fallback, then move the live runtime to match.
  clearThreadWorktree(threadId);
  try {
    await relocateThreadSession(threadId, ws.path);
  } catch (err) {
    console.error(
      `[session-service] failed to heal stale cwd for session ${sessionId}:`,
      err,
    );
  }
  // Tell the renderer the thread is back on its workspace so the worktree
  // selector and cwd-scoped views refresh without a reload.
  if (workspaceId) worktreeBroadcaster.broadcast(workspaceId, threadId);
}

/**
 * Starts (or stops) the out-of-band worktree watcher for a live session based
 * on its current cwd: a session running inside a worktree is watched so its
 * removal triggers {@link healStaleWorktreeCwd}; a session on the workspace
 * path needs no watcher. Idempotent — safe to call after every create/relocate.
 */
export function refreshWorktreeWatch(sessionId: string): void {
  const entry = store.get(sessionId);
  if (!entry) return;
  const ws = entry.workspaceId ? getWorkspace(entry.workspaceId) : null;
  if (!ws?.path || resolve(entry.cwd) === resolve(ws.path)) {
    worktreeWatcher.unwatch(sessionId);
    return;
  }
  worktreeWatcher.watch(sessionId, entry.cwd, healStaleWorktreeCwd);
}

/**
 * Moves a thread's live runtime to `newCwd`, preserving its conversation and
 * stable handle so subsequent agent tools immediately run in the new directory
 * (used when a thread moves into or out of a worktree). No-op when the thread
 * has no live session — the next open derives cwd from the DB.
 * Returns true when a live session was relocated.
 */
export async function relocateThreadSession(
  threadId: string,
  newCwd: string,
): Promise<boolean> {
  const existing = store.getByThreadId(threadId);
  if (!existing) return false;
  const entry = store.get(existing.sessionId);
  if (!entry) return false;

  const sessionFile =
    entry.handle.sessionFile ?? getThread(threadId)?.sessionFile ?? null;

  // Pre-create the plan dir in the new cwd so plan-mode writes don't fail.
  await mkdir(join(newCwd, PLAN_DIR), { recursive: true }).catch(() => {});

  if (entry.handle.sessionFile) {
    // Use the SDK's session replacement lifecycle. It rebuilds cwd-bound
    // built-ins (bash/read/write/etc.) while retaining this host-owned handle.
    await entry.handle.relocateCwd(newCwd);

    // Workspace tools are also constructed with cwd-specific paths, so refresh
    // them after the runtime has moved.
    const { customTools, mode } = await buildSessionCustomTools(
      threadId,
      newCwd,
      entry.workspaceId,
    );
    entry.handle.setCustomTools(customTools);
    if (mode) entry.handle.setMode(mode);

    if (resolve(entry.handle.getCwd()) !== resolve(newCwd)) {
      throw new Error(
        `Agent runtime remained in ${entry.handle.getCwd()} after relocating to ${newCwd}`,
      );
    }

    store.updateCwd(existing.sessionId, newCwd);
    sessionEvents.reattach(existing.sessionId, entry.handle, newCwd);
    refreshWorktreeWatch(existing.sessionId);
    return true;
  }

  if (sessionFile) {
    // Defensive recovery for an inconsistent live entry whose persisted file
    // is known by the thread but not by its current handle.
    const restoredHandle = await openSessionForThread(
      threadId,
      sessionFile,
      newCwd,
      entry.workspaceId,
    );
    if (resolve(restoredHandle.getCwd()) !== resolve(newCwd)) {
      restoredHandle.dispose();
      throw new Error(
        `Restored agent runtime remained in ${restoredHandle.getCwd()} after relocating to ${newCwd}`,
      );
    }
    store.replaceHandle(existing.sessionId, restoredHandle);
    store.updateCwd(existing.sessionId, newCwd);
    sessionEvents.reattach(existing.sessionId, restoredHandle, newCwd);
    refreshWorktreeWatch(existing.sessionId);
    return true;
  }

  // An in-memory session cannot be switched by the SDK. Recreate it as a
  // fallback; this path has no persisted conversation to preserve.
  const newHandle = await createHandleForThread(
    threadId,
    newCwd,
    entry.workspaceId,
  );
  store.replaceHandle(existing.sessionId, newHandle);
  store.updateCwd(existing.sessionId, newCwd);
  sessionEvents.reattach(existing.sessionId, newHandle, newCwd);
  refreshWorktreeWatch(existing.sessionId);
  return true;
}

/**
 * Merge MCP- and LSP-derived tools for a workspace. Both are loaded in
 * parallel; failures in either don't block the other.
 */
export async function collectCustomTools(
  workspaceId: string,
  workspacePath: string,
  mode?: SdkConfig["mode"],
  threadId?: string,
) {
  // All custom (non-builtin) tools are registered in every mode — MCP, LSP, and
  // memory stay available in Ask and Plan, matching `MODE_CONFIG.allowCustomTools`.
  // Mode gating of the *builtins* (edit/write/bash vs read/grep) happens via
  // `setMode` → `computeActiveToolsForMode`, which preserves these custom tools
  // and filters builtin-named ones (e.g. `todo`, `plan_*`) by the mode's allowlist.
  const todoTool = threadId ? createTodoTool(threadId) : null;
  const memoryTool = createMemoryTool(workspaceId);
  // The `plan` tool is only meaningful in modes whose allowlist includes the
  // `plan` builtin (Plan, plus any custom mode that opts in); it's gated out of
  // other modes by the builtin allowlist anyway, so create it only when needed.
  const allowsPlanTool = mode
    ? getModeConfig(mode, workspacePath).allowedBuiltins.includes("plan")
    : false;
  const planTools = allowsPlanTool ? createPlanModeTools(workspacePath) : [];

  const [mcpTools, lspTools, githubTools] = await Promise.all([
    import("./mcp-service.js")
      .then((m) => m.getMcpToolsForSession())
      .catch((err) => {
        console.warn("[session-service] failed to load MCP tools:", err);
        return [];
      }),
    import("./language-service.js")
      .then((m) => m.getLspToolsForSession(workspaceId, workspacePath))
      .catch((err) => {
        console.warn("[session-service] failed to load LSP tools:", err);
        return [];
      }),
    // GitHub tools are only exposed when `gh` is installed and authenticated, so
    // the agent never sees them in a repo it can't reach.
    Promise.all([
      import("./github-service.js"),
      import("./github-tool.js"),
    ])
      .then(async ([svc, tool]) => {
        const cwd = svc.threadRepoCwd(threadId, workspacePath);
        if (!(await svc.isGithubAvailable(cwd))) return [];
        return tool.createGithubTools(threadId, workspacePath);
      })
      .catch((err) => {
        console.warn("[session-service] failed to load GitHub tools:", err);
        return [];
      }),
  ]);
  return [
    ...(todoTool ? [todoTool] : []),
    memoryTool,
    questionTool,
    createAutomationTool(workspaceId),
    ...planTools,
    ...mcpTools,
    ...lspTools,
    ...githubTools,
  ];
}

async function refreshSessionTools(
  sessionId: string,
  handle: ManagedSessionHandle,
  workspaceId: string,
  workspacePath: string,
) {
  const threadId = store.getThreadId(sessionId);
  if (!threadId) return;

  const thread = getThread(threadId);
  const mode = normalizeMode(thread?.mode);
  const tools = await collectCustomTools(
    workspaceId,
    workspacePath,
    mode,
    threadId,
  );
  handle.setCustomTools(tools);

  if (mode) {
    handle.setMode(mode);
  }
}

export async function refreshWorkspaceSessionTools(workspaceId: string) {
  const ws = getWorkspace(workspaceId);
  if (!ws) return;

  for (const { sessionId, handle, cwd } of store.getByWorkspaceId(
    workspaceId,
  )) {
    await refreshSessionTools(sessionId, handle, workspaceId, cwd);
  }
}

/**
 * Refresh custom tools for every active session across all workspaces. Used
 * when application-wide configuration (e.g. MCP servers) changes.
 */
export async function refreshAllSessionTools() {
  for (const { sessionId, handle, workspaceId, cwd } of store.getAll()) {
    if (!workspaceId) continue;
    const ws = getWorkspace(workspaceId);
    if (!ws) continue;
    await refreshSessionTools(sessionId, handle, workspaceId, cwd);
  }
}
