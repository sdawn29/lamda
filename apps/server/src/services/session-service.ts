import {
  createManagedSession,
  openManagedSession,
  createPlanModeTools,
  createTodoTool,
  createMemoryTool,
  createQuestionTool,
  normalizeMode,
  PLAN_DIR,
  type SdkConfig,
  type ManagedSessionHandle,
} from "@lamda/pi-sdk";
import { updateThreadSessionFile, getWorkspace, getThread } from "@lamda/db";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { store } from "../store.js";
import { sessionEvents } from "../session-events.js";
import { waitForAnswer } from "./question-registry.js";
import { createToolApprovalBridge } from "./tool-approval-bridge.js";

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

  const { customTools, mode } = await buildSessionCustomTools(
    threadId,
    cwd,
    workspaceId,
  );
  const handle = await createManagedSession({
    cwd,
    customTools,
    mode,
    toolApproval: createToolApprovalBridge(threadId),
    ...opts,
  });
  const sessionId = store.create(handle, cwd, threadId, workspaceId);

  if (handle.sessionFile) {
    updateThreadSessionFile(threadId, handle.sessionFile);
  }

  // Start the event hub immediately so we capture tool_execution_start events
  const entry = store.get(sessionId);
  if (entry) {
    sessionEvents.ensure(sessionId, entry.threadId, entry.handle, entry.cwd);
  }

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
 * attached, otherwise the workspace's own path.
 */
export function resolveThreadCwd(
  thread: { worktreePath?: string | null } | null | undefined,
  workspacePath: string,
): string {
  return thread?.worktreePath || workspacePath;
}

/**
 * Reopens a thread's live session in `newCwd`, preserving its conversation by
 * reusing the same session file, so the same thread keeps running in the new
 * directory (used when a thread moves into or out of a worktree). No-op when
 * the thread has no live session — the next open derives cwd from the DB.
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

  if (sessionFile) {
    const newHandle = await openSessionForThread(
      threadId,
      sessionFile,
      newCwd,
      entry.workspaceId,
    );
    store.replaceHandle(existing.sessionId, newHandle);
  }
  // Keep the recorded cwd in sync even if there was no file to reopen, so git
  // routes (which read store.getCwd) target the new directory.
  store.updateCwd(existing.sessionId, newCwd);

  // Re-attach the event hub to the (possibly new) handle in the new cwd.
  await sessionEvents.dispose(existing.sessionId);
  const refreshed = store.get(existing.sessionId);
  if (refreshed) {
    sessionEvents.ensure(existing.sessionId, threadId, refreshed.handle, newCwd);
  }
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
  // The `plan` tool is only meaningful in Plan mode and is gated out of other
  // modes by the builtin allowlist anyway; create it only when needed.
  const planTools = mode === "plan" ? createPlanModeTools(workspacePath) : [];

  const [mcpTools, lspTools] = await Promise.all([
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
  ]);
  return [
    ...(todoTool ? [todoTool] : []),
    memoryTool,
    questionTool,
    ...planTools,
    ...mcpTools,
    ...lspTools,
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
  const tools = await collectCustomTools(workspaceId, workspacePath, mode, threadId);
  handle.setCustomTools(tools);

  if (mode) {
    handle.setMode(mode);
  }
}

export async function refreshWorkspaceSessionTools(workspaceId: string) {
  const ws = getWorkspace(workspaceId);
  if (!ws) return;

  for (const { sessionId, handle } of store.getByWorkspaceId(workspaceId)) {
    await refreshSessionTools(sessionId, handle, workspaceId, ws.path);
  }
}

/**
 * Refresh custom tools for every active session across all workspaces. Used
 * when application-wide configuration (e.g. MCP servers) changes.
 */
export async function refreshAllSessionTools() {
  for (const { sessionId, handle, workspaceId } of store.getAll()) {
    if (!workspaceId) continue;
    const ws = getWorkspace(workspaceId);
    if (!ws) continue;
    await refreshSessionTools(sessionId, handle, workspaceId, ws.path);
  }
}
