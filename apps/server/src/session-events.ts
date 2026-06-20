import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import {
  insertUserBlock,
  insertAssistantStartBlock,
  insertToolBlock,
  appendAssistantTextDelta,
  appendAssistantThinkingDelta,
  finalizeAssistantBlock,
  updateToolBlockResult,
  updateToolBlockPartialResult,
  listRunningToolBlocks,
  insertAgentTurn,
  insertCompactionBlock,
  insertAiUsage,
  getThread,
} from "@lamda/db";
import type { ManagedSessionHandle, SessionEvent } from "@lamda/pi-sdk";
import { PLAN_DIR } from "@lamda/pi-sdk";
import { gitStatus, gitStashCreate, gitWriteCheckpointRef } from "@lamda/git";
import {
  threadStatusBroadcaster,
  type ThreadStatus,
} from "./thread-status-broadcaster.js";
import { scheduleReflection } from "./services/memory-reflection.js";
import { store } from "./store.js";

const MAX_RECENT_EVENTS = 512;

// Run a background memory-reflection pass every this-many completed turns, so
// long-running threads consolidate learnings periodically instead of only at
// compaction/archive. Reflection is watermarked + deduped, so this is cheap.
const REFLECT_EVERY_N_TURNS = 6;

// ── Session status types ──────────────────────────────────────────────────────

export type SessionPendingError = {
  title: string;
  message: string;
  retryable: boolean;
  retryCount?: number;
};

/** A tool call paused awaiting the user's approval, surfaced in the status snapshot. */
export type SessionPendingApproval = {
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
  scopeLabel: string;
};

export type SessionStatus = {
  isRunning: boolean;
  isCompacting: boolean;
  compactionReason: "manual" | "threshold" | "overflow" | null;
  pendingError: SessionPendingError | null;
  /**
   * The tool call currently awaiting approval, if any. Restored on thread
   * mount so switching away and back doesn't lose the approval prompt (the
   * live `tool_approval_request` event fires only once and isn't replayed).
   */
  pendingApproval: SessionPendingApproval | null;
};

// ── Self-healing observers ──────────────────────────────────────────────────────
// The healing service registers these; the hub stays decoupled (it imports
// nothing from the service, avoiding an import cycle).

export type AgentTurnOutcome = "success" | "error" | "aborted";

export type AgentTurnEndInfo = {
  sessionId: string;
  threadId: string;
  outcome: AgentTurnOutcome;
  errorMessage?: string;
};

export type SessionCrashInfo = {
  sessionId: string;
  threadId: string;
  message: string;
  /** True when the event generator died mid-turn (an interrupted prompt). */
  wasRunning: boolean;
};

/** Synthetic healing-status events reusing the client's auto-retry banner UI. */
export type HealingStatusEvent =
  | { type: "auto_retry_start"; attempt: number; errorMessage: string }
  | { type: "auto_retry_end"; success: boolean; finalError?: string };

let agentTurnObserver: ((info: AgentTurnEndInfo) => void) | null = null;
let sessionCrashObserver: ((info: SessionCrashInfo) => void) | null = null;

export function setAgentTurnObserver(
  cb: (info: AgentTurnEndInfo) => void,
): void {
  agentTurnObserver = cb;
}

export function setSessionCrashObserver(
  cb: (info: SessionCrashInfo) => void,
): void {
  sessionCrashObserver = cb;
}

// ── Internal event types ──────────────────────────────────────────────────────

type ServerErrorEvent = { type: "server_error"; message: string };
type TurnFileChangedEvent = {
  type: "turn_file_changed";
  filePath: string;
  postStatusCode: string;
  wasCreatedByTurn: boolean;
};
type PlanSavedEvent = {
  type: "plan_saved";
  /** Absolute path to the plan file on disk. */
  filePath: string;
  /** Workspace-relative path (always forward-slash, starts with `.lamda/plans/`). */
  relativePath: string;
};
/** A gated tool is paused awaiting the user's approval decision. */
type ToolApprovalRequestEvent = {
  type: "tool_approval_request";
  toolCallId: string;
  toolName: string;
  /** Tool arguments, so the UI can summarize what's about to run. */
  input: Record<string, unknown>;
  /** What an Always/Don't-allow decision will remember (e.g. `git status`). */
  scopeLabel: string;
};
/** A previously-requested approval has been settled (or cancelled). */
type ToolApprovalResolvedEvent = {
  type: "tool_approval_resolved";
  toolCallId: string;
  decision: "once" | "always" | "never" | "reject";
};
type HubEvent =
  | SessionEvent
  | ServerErrorEvent
  | TurnFileChangedEvent
  | PlanSavedEvent
  | ToolApprovalRequestEvent
  | ToolApprovalResolvedEvent;

type SessionEventRecord = {
  id: number;
  event: HubEvent;
  data: string;
};

type SessionEventSubscriber = {
  onEvent: (record: SessionEventRecord) => void;
  close: () => void;
};

type SessionEventSubscription = {
  initialEvents: SessionEventRecord[];
  unsubscribe: () => void;
  closed: Promise<void>;
};

function serializeEvent(event: HubEvent): string {
  try {
    return JSON.stringify(event);
  } catch {
    return JSON.stringify({ serializeError: true, type: event.type });
  }
}

function parseEventId(value?: string): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * Pull the first question's text out of the `question` tool's args, so a thread
 * status notification can say what was actually asked. Returns undefined when
 * the args don't carry a usable question string.
 */
function firstQuestionText(args: unknown): string | undefined {
  if (!args || typeof args !== "object") return undefined;
  const questions = (args as { questions?: unknown }).questions;
  if (!Array.isArray(questions)) return undefined;
  for (const q of questions) {
    const text = (q as { question?: unknown })?.question;
    if (typeof text === "string" && text.trim()) return text.trim();
  }
  return undefined;
}

export interface TurnFileDetail {
  filePath: string;
  postStatusCode: string;
  preStatusCode: string;
  preContent: string | null;
  wasCreatedByTurn: boolean;
}

interface TurnContext {
  assistantBlockId: string | null;
  startTime: number;
  model?: string;
  provider?: string;
  thinkingLevel?: string;
}

interface ToolContext {
  toolBlockId: string;
  startTime: number;
}

interface ToolMeta {
  toolCallId: string;
  toolName: string;
  args: unknown;
}

class SessionEventHub {
  private subscribers = new Map<string, SessionEventSubscriber>();
  private recentEvents: SessionEventRecord[] = [];
  private currentRunEvents: SessionEventRecord[] = [];
  private toolMetaMap = new Map<string, ToolMeta>();
  private generator: AsyncGenerator<SessionEvent> | null = null;
  private consumeTask: Promise<void> | null = null;
  private nextEventId = 0;
  private runInProgress = false;
  private disposed = false;
  private isCompacting = false;
  private compactionReason: "manual" | "threshold" | "overflow" | null = null;
  private pendingErrorState: SessionPendingError | null = null;
  // Tool calls paused awaiting user approval, keyed by toolCallId. Included in
  // the status snapshot so a thread re-mount can restore the approval prompt.
  private pendingApprovals = new Map<string, SessionPendingApproval>();
  private turnContext: TurnContext | null = null;
  private pendingThinkingLevel: string | null = null;
  private currentToolBlocks = new Map<string, ToolContext>();
  private preTurnStatusMap: Map<string, string> | null = null;
  private preTurnFileContents: Map<string, string> | null = null;
  private preTurnCheckpointSha = "";
  private preTurnCapturePromise: Promise<void> | null = null;
  private currentTurnEmittedFiles = new Set<string>();
  private currentTurnStartTime = 0;
  private lastTurnChangedRaw = "";
  private lastTurnFiles: TurnFileDetail[] = [];
  private textDeltaBuffer = "";
  private thinkingDeltaBuffer = "";
  private deltaFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private deltaBlockId: string | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private onIdle: (() => void) | null = null;
  private cachedWorkspaceId: string | null = null;
  private turnsSinceReflection = 0;

  constructor(
    private readonly sessionId: string,
    private readonly threadId: string,
    private handle: ManagedSessionHandle,
    private cwd: string | null = null,
    onIdle?: () => void,
  ) {
    this.onIdle = onIdle ?? null;
    // Start consuming immediately so we don't miss any events
    this.ensureStarted();
  }

  private scheduleIdleDispose() {
    if (this.idleTimer || this.disposed) return;
    this.idleTimer = setTimeout(
      () => {
        this.idleTimer = null;
        if (this.subscribers.size === 0 && !this.disposed) {
          this.onIdle?.();
        }
      },
      10 * 60 * 1000,
    );
  }

  private cancelIdleDispose() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  setNextThinkingLevel(level: string) {
    this.pendingThinkingLevel = level;
  }

  getLastTurnChanges(): string {
    return this.lastTurnChangedRaw;
  }

  getLastTurnFiles(): TurnFileDetail[] {
    return this.lastTurnFiles;
  }

  getCurrentTurnStartTime(): number {
    return this.currentTurnStartTime;
  }

  clearLastTurnFiles(): void {
    this.lastTurnFiles = [];
    this.lastTurnChangedRaw = "";
  }

  private flushDeltas() {
    if (this.deltaFlushTimer) {
      clearTimeout(this.deltaFlushTimer);
      this.deltaFlushTimer = null;
    }
    if (!this.deltaBlockId) return;
    if (this.textDeltaBuffer) {
      appendAssistantTextDelta(this.deltaBlockId, this.textDeltaBuffer);
      this.textDeltaBuffer = "";
    }
    if (this.thinkingDeltaBuffer) {
      appendAssistantThinkingDelta(this.deltaBlockId, this.thinkingDeltaBuffer);
      this.thinkingDeltaBuffer = "";
    }
  }

  private scheduleDeltaFlush(blockId: string) {
    this.deltaBlockId = blockId;
    if (this.deltaFlushTimer) return;
    this.deltaFlushTimer = setTimeout(() => {
      this.deltaFlushTimer = null;
      this.flushDeltas();
    }, 100);
  }

  /**
   * True when a git --short status code denotes a file that does not exist at
   * HEAD: untracked (`??`) or newly added (`A`/`AM`). Modified tracked files
   * (` M`, `MM`, `MD`, `RM`, …) return false so revert restores them instead of
   * deleting them.
   */
  private isNewFileStatus(code: string): boolean {
    const x = code[0] ?? " ";
    return x === "?" || x === "A";
  }

  private parseStatusToMap(raw: string): Map<string, string> {
    const map = new Map<string, string>();
    for (const line of raw.split("\n")) {
      const trimmed = line.trimEnd();
      if (!trimmed) continue;
      const rawStatus = trimmed.slice(0, 2);
      const filePath = trimmed.slice(3);
      if (filePath) map.set(filePath, rawStatus);
    }
    return map;
  }

  private maybeEmitPlanSaved(event: SessionEvent): void {
    if (!this.cwd || this.disposed) return;
    if (event.type !== "tool_execution_end") return;
    const msg = event as {
      toolCallId: string;
      toolName?: string;
      isError?: boolean;
    };
    if (msg.isError) return;

    // Tool name may arrive on the event or only on the earlier _start.
    const meta = this.toolMetaMap.get(msg.toolCallId);
    const toolName = (msg.toolName ?? meta?.toolName ?? "").toLowerCase();
    const args = meta?.args as
      | { path?: unknown; operation?: unknown }
      | undefined;
    // A plan is saved by either the `plan` tool (operation "write") or a raw
    // `write` that happens to target the plan dir.
    const isPlanToolWrite = toolName === "plan" && args?.operation === "write";
    if (!isPlanToolWrite && toolName !== "write") return;

    const rawPath = typeof args?.path === "string" ? args.path : null;
    if (!rawPath) return;

    const absPath = isAbsolute(rawPath) ? rawPath : resolve(this.cwd, rawPath);
    const rel = relative(this.cwd, absPath).replace(/\\/g, "/");
    // Must be inside <cwd>/.lamda/plans and be a markdown file.
    if (!rel.startsWith(`${PLAN_DIR}/`) || rel.includes("..")) return;
    if (!rel.toLowerCase().endsWith(".md")) return;

    this.emit({ type: "plan_saved", filePath: absPath, relativePath: rel });
  }

  private async checkAndEmitNewFileChanges(): Promise<void> {
    if (!this.cwd || this.disposed) return;
    if (this.preTurnCapturePromise) await this.preTurnCapturePromise;
    if (!this.preTurnStatusMap || this.disposed) return;
    try {
      const raw = await Promise.race([
        gitStatus(this.cwd),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 3_000),
        ),
      ]);
      if (!this.preTurnStatusMap || this.disposed) return;
      const postMap = this.parseStatusToMap(raw);
      for (const [filePath, postStatusCode] of postMap) {
        if (this.currentTurnEmittedFiles.has(filePath)) continue;
        const preStatusCode = this.preTurnStatusMap.get(filePath) ?? "";
        if (preStatusCode !== postStatusCode) {
          const wasCreatedByTurn =
            !this.preTurnStatusMap.has(filePath) &&
            this.isNewFileStatus(postStatusCode);
          this.currentTurnEmittedFiles.add(filePath);
          this.emit({
            type: "turn_file_changed",
            filePath,
            postStatusCode,
            wasCreatedByTurn,
          });
        }
      }
    } catch {
      // non-critical
    }
  }

  private async capturePreTurnStatus(): Promise<void> {
    if (!this.cwd) return;
    this.currentTurnEmittedFiles.clear();
    // Clear the previous turn's file snapshot at the START of this turn. Otherwise
    // getLastTurnFiles() would return the just-completed turn's files while this
    // turn is in progress, and /git/turns would surface them as a phantom live
    // turn (id 0) duplicating the already-persisted previous turn.
    this.lastTurnFiles = [];
    this.lastTurnChangedRaw = "";
    this.preTurnCheckpointSha = "";
    const timeoutMs = 5_000;
    const deadline = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("git-status timeout")), timeoutMs),
    );
    try {
      // Stash resolves to "" on timeout so it never blocks the turn capture.
      const stashDeadline = new Promise<string>((resolve) =>
        setTimeout(() => resolve(""), timeoutMs),
      );
      const stashPromise = gitStashCreate(this.cwd)
        .then(async (sha) => {
          // Anchor the checkpoint object under a private ref so `git gc` can't
          // reclaim it and it stays out of the user's `git stash list`.
          if (sha) await gitWriteCheckpointRef(this.cwd!, sha).catch(() => {});
          return sha;
        })
        .catch(() => "");

      const [raw, checkpointSha] = await Promise.all([
        Promise.race([gitStatus(this.cwd), deadline]),
        // Non-destructive stash checkpoint — returns "" if tree is clean or on timeout.
        Promise.race([stashPromise, stashDeadline]),
      ]);

      this.preTurnStatusMap = this.parseStatusToMap(raw);
      this.preTurnCheckpointSha = checkpointSha;
      this.currentTurnStartTime = Date.now();

      // Read current content of modified files so we can restore them on revert.
      // Files at HEAD don't need content stored (git restore handles them).
      const MAX_FILE_BYTES = 512 * 1024;
      const contents = new Map<string, string>();
      await Promise.all(
        Array.from(this.preTurnStatusMap.entries()).map(
          async ([filePath, rawStatus]) => {
            // Skip deleted files — they can't be read from disk
            if (rawStatus.includes("D")) return;
            const fullPath = join(this.cwd!, filePath);
            try {
              const buf = await readFile(fullPath);
              if (buf.length > MAX_FILE_BYTES) return;
              // Skip binary files (contain null bytes)
              if (buf.includes(0)) return;
              contents.set(filePath, buf.toString("utf8"));
            } catch {
              // Unreadable file — skip, will fall back to git restore
            }
          },
        ),
      );
      this.preTurnFileContents = contents;
    } catch {
      this.preTurnStatusMap = null;
      this.preTurnFileContents = null;
      this.preTurnCheckpointSha = "";
    }
  }

  private async capturePostTurnStatus(): Promise<void> {
    if (!this.cwd) return;
    const pre = this.preTurnStatusMap ?? new Map<string, string>();
    const preContents = this.preTurnFileContents ?? new Map<string, string>();
    const startedAt = this.currentTurnStartTime || Date.now();
    const checkpointSha = this.preTurnCheckpointSha;
    this.preTurnStatusMap = null;
    this.preTurnFileContents = null;
    this.preTurnCheckpointSha = "";
    this.currentTurnStartTime = 0;

    try {
      const raw = await gitStatus(this.cwd);
      const postMap = this.parseStatusToMap(raw);
      const changedLines: string[] = [];
      const turnFiles: TurnFileDetail[] = [];
      const processedFiles = new Set<string>();

      // Pass 1: files whose git status code changed (new files, status transitions)
      for (const [filePath, postStatusCode] of postMap) {
        const preStatusCode = pre.get(filePath) ?? "";
        if (preStatusCode !== postStatusCode) {
          changedLines.push(`${postStatusCode} ${filePath}`);
          // A file counts as "created by this turn" only when it didn't exist
          // at HEAD — i.e. its post-turn status is untracked (??) or added (A).
          // A previously-committed file that the agent merely modified is absent
          // from the pre-turn dirty status too, but it must NOT be flagged as
          // created, otherwise revert would `fs.unlink` (delete) the whole file.
          const wasCreatedByTurn =
            !pre.has(filePath) && this.isNewFileStatus(postStatusCode);
          const preContent = wasCreatedByTurn
            ? null
            : (preContents.get(filePath) ?? null);
          turnFiles.push({
            filePath,
            postStatusCode,
            preStatusCode,
            preContent,
            wasCreatedByTurn,
          });
          processedFiles.add(filePath);
        }
      }

      // Pass 2: files already modified before the turn whose status code is
      // unchanged but whose content was modified during the turn.
      // Example: file was " M" before turn 2 and is still " M" after — the
      // status code comparison above misses this; content comparison catches it.
      await Promise.all(
        Array.from(preContents.entries())
          .filter(
            ([filePath]) =>
              !processedFiles.has(filePath) && postMap.has(filePath),
          )
          .map(async ([filePath, preContent]) => {
            const postStatusCode = postMap.get(filePath)!;
            const fullPath = join(this.cwd!, filePath);
            try {
              const currentContent = await readFile(fullPath, "utf8");
              if (currentContent !== preContent) {
                changedLines.push(`${postStatusCode} ${filePath}`);
                turnFiles.push({
                  filePath,
                  postStatusCode,
                  preStatusCode: pre.get(filePath) ?? "",
                  preContent,
                  wasCreatedByTurn: false,
                });
              }
            } catch {
              // unreadable — skip
            }
          }),
      );

      this.lastTurnChangedRaw = changedLines.join("\n");
      this.lastTurnFiles = turnFiles;

      if (turnFiles.length > 0) {
        insertAgentTurn({
          sessionId: this.sessionId,
          threadId: this.threadId,
          startedAt,
          endedAt: Date.now(),
          checkpointSha,
          files: turnFiles,
        });
        // Surface the files just touched as the session's "active files", so the
        // next prompt can retrieve memories tied to this area of the code.
        const entry = store.get(this.sessionId);
        if (entry) entry.activeFiles = turnFiles.map((f) => f.filePath);
      }
    } catch {
      // keep previous value
    }
  }

  emitError(message: string) {
    if (this.disposed) return;
    const event: ServerErrorEvent = { type: "server_error", message };
    this.persist(event);
    this.emit(event);
  }

  dismissPendingErrors(): void {
    this.pendingErrorState = null;
    this.isCompacting = false;
    this.compactionReason = null;
    const errorTypes = new Set([
      "server_error",
      "auto_retry_start",
      "auto_retry_end",
      "compaction_start",
      "compaction_end",
    ]);
    this.recentEvents = this.recentEvents.filter(
      (record) => !errorTypes.has(record.event.type),
    );
  }

  getStatus(): SessionStatus {
    // Surface the most-recent unresolved approval — the one the user was last
    // prompted with (matches the single-prompt-at-a-time client UI).
    let pendingApproval: SessionPendingApproval | null = null;
    for (const approval of this.pendingApprovals.values()) {
      pendingApproval = approval;
    }
    return {
      isRunning: this.runInProgress,
      isCompacting: this.isCompacting,
      compactionReason: this.compactionReason,
      pendingError: this.pendingErrorState,
      pendingApproval,
    };
  }

  ensureStarted() {
    if (this.disposed || this.consumeTask) return;

    this.consumeTask = this.consume().finally(() => {
      this.consumeTask = null;
      this.generator = null;
    });
  }

  subscribe(options: {
    lastEventId?: string;
    onEvent: (record: SessionEventRecord) => void;
  }): SessionEventSubscription {
    this.ensureStarted();

    const initialEvents = this.getReplayEvents(options.lastEventId);
    const subscriberId = randomUUID();

    let closed = false;
    let resolveClosed = () => {};
    const closedPromise = new Promise<void>((resolve) => {
      resolveClosed = resolve;
    });

    const close = () => {
      if (closed) return;
      closed = true;
      this.subscribers.delete(subscriberId);
      resolveClosed();
      if (this.subscribers.size === 0) {
        this.scheduleIdleDispose();
      }
    };

    this.cancelIdleDispose();
    this.subscribers.set(subscriberId, {
      onEvent: options.onEvent,
      close,
    });

    return {
      initialEvents,
      unsubscribe: close,
      closed: closedPromise,
    };
  }

  /**
   * Emit a synthetic auto-retry event so self-healing surfaces through the same
   * "Retrying" banner the SDK's real transient retries use — no new chat UI.
   */
  emitHealingStatus(ev: HealingStatusEvent): void {
    if (this.disposed) return;
    this.emit(ev as HubEvent);
  }

  /** Surface a paused tool call so the client can prompt for approval. */
  emitToolApprovalRequest(payload: {
    toolCallId: string;
    toolName: string;
    input: Record<string, unknown>;
    scopeLabel: string;
  }): void {
    if (this.disposed) return;
    // Remember it so a thread re-mount can restore the prompt via /status.
    this.pendingApprovals.set(payload.toolCallId, payload);
    // Surface in the sidebar: this thread is now paused waiting on the user.
    threadStatusBroadcaster.broadcast(this.threadId, "awaiting", {
      reason: "approval",
      detail: payload.toolName,
    });
    this.emit({ type: "tool_approval_request", ...payload });
  }

  /** Notify the client that a pending approval has been settled or cancelled. */
  emitToolApprovalResolved(payload: {
    toolCallId: string;
    decision: "once" | "always" | "never" | "reject";
  }): void {
    if (this.disposed) return;
    this.pendingApprovals.delete(payload.toolCallId);
    // The user responded: the turn resumes. If other approvals are still
    // pending, keep showing "awaiting"; otherwise the run is streaming again.
    threadStatusBroadcaster.broadcast(
      this.threadId,
      this.pendingApprovals.size > 0 ? "awaiting" : "streaming",
    );
    this.emit({ type: "tool_approval_resolved", ...payload });
  }

  /**
   * Swap in a freshly-rebuilt session handle after a crash, keeping this hub —
   * and therefore every WS/SSE subscriber, the sessionId, and the event-id
   * sequence — intact. The old event generator is returned and a new consume
   * loop starts once it settles.
   *
   * `newCwd` relocates the hub's working directory (used when a thread moves
   * into or out of a worktree). Without it, per-turn git tracking would keep
   * inspecting the old directory and miss every change the agent makes in the
   * new one — so the "Files changed" card would have no files and not render.
   */
  reattach(newHandle: ManagedSessionHandle, newCwd?: string | null): void {
    if (this.disposed) return;
    if (newCwd !== undefined) this.cwd = newCwd;
    const previous = this.consumeTask;
    this.generator?.return(undefined).catch(() => undefined);
    this.generator = null;
    this.consumeTask = null;
    this.handle = newHandle;
    this.runInProgress = false;
    void (previous ?? Promise.resolve()).then(() => {
      if (!this.disposed) this.ensureStarted();
    });
  }

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelIdleDispose();

    this.toolMetaMap.clear();
    this.currentToolBlocks.clear();
    this.currentTurnEmittedFiles.clear();
    this.pendingApprovals.clear();
    this.currentRunEvents = [];
    this.runInProgress = false;
    this.preTurnStatusMap = null;
    this.preTurnFileContents = null;
    this.preTurnCheckpointSha = "";
    this.preTurnCapturePromise = null;

    const subscribers = [...this.subscribers.values()];
    this.subscribers.clear();
    for (const subscriber of subscribers) {
      subscriber.close();
    }

    this.generator?.return(undefined).catch(() => undefined);
    this.consumeTask?.catch(() => undefined);
  }

  private getReplayEvents(lastEventId?: string): SessionEventRecord[] {
    const parsedLastEventId = parseEventId(lastEventId);
    if (parsedLastEventId === null) {
      // Fresh connect (no lastEventId) — state is restored via the REST /status
      // endpoint; no event replay needed for idle sessions. Only replay events
      // from the currently-in-progress agent turn so the client can track live
      // streaming state (tool execution, text deltas, etc.).
      if (this.runInProgress) {
        const toolBlocks = listRunningToolBlocks(this.threadId);
        const toolEvents: SessionEventRecord[] = toolBlocks
          .filter((b) => b.role === "tool" && b.toolStatus === "running")
          .map((block) => ({
            id: 0,
            event: {
              type: "tool_execution_start",
              toolCallId: block.toolCallId ?? "",
              toolName: block.toolName ?? "",
              args: block.toolArgs ? JSON.parse(block.toolArgs) : {},
            } as any,
            data: "",
          }));
        return [...this.currentRunEvents, ...toolEvents];
      }
      return [];
    }
    // Client has a lastEventId — replay only genuinely missed events.
    // Prefer currentRunEvents for the active turn; fall back to recentEvents.
    const currentRunStartId = this.currentRunEvents[0]?.id;
    const currentRunEndId = this.currentRunEvents.at(-1)?.id;
    if (
      currentRunStartId !== undefined &&
      currentRunEndId !== undefined &&
      parsedLastEventId >= currentRunStartId &&
      parsedLastEventId <= currentRunEndId
    ) {
      return this.currentRunEvents.filter(
        (record) => record.id > parsedLastEventId,
      );
    }
    return this.recentEvents.filter((record) => record.id > parsedLastEventId);
  }

  private async consume() {
    const generator = this.handle.events();
    this.generator = generator;

    try {
      for await (const event of generator) {
        if (event.type === "agent_start") {
          // Snapshot git status before the agent does any work.
          // Uses agent_start (fires once per user prompt) rather than turn_start
          // (fires per LLM call) so the baseline is always taken before tool calls.
          this.preTurnCapturePromise = this.capturePreTurnStatus();
        } else if (event.type === "agent_end") {
          // Wait for pre-capture to finish before computing the diff; without this
          // a slow gitStatus call could still be running when we read preTurnStatusMap.
          await this.preTurnCapturePromise;
          this.preTurnCapturePromise = null;
          // Capture post-turn status before emitting so clients see data immediately
          // when they query after receiving agent_end.
          await this.capturePostTurnStatus();
        } else if (event.type === "tool_execution_end") {
          // Check for file changes after each tool — non-blocking so it doesn't
          // delay event delivery. Emits turn_file_changed for newly changed files.
          void this.checkAndEmitNewFileChanges();
          // Detect plan-mode artifact writes; emits plan_saved for client UX.
          this.maybeEmitPlanSaved(event);
        }
        this.persist(event);
        this.emit(event);

        if (event.type === "agent_end") {
          this.notifyTurnEnd(event);
          this.maybeReflectAfterTurn();
        }
      }
    } catch (error) {
      if (!this.disposed) {
        const message = error instanceof Error ? error.message : String(error);
        // Capture before resetting: a mid-turn crash means there's a prompt to
        // resume, which session-level healing keys off.
        const wasRunning = this.runInProgress;
        this.toolMetaMap.clear();
        this.currentToolBlocks.clear();
        this.pendingApprovals.clear();
        this.runInProgress = false;
        this.currentRunEvents = [];
        this.emit({ type: "server_error", message });
        try {
          sessionCrashObserver?.({
            sessionId: this.sessionId,
            threadId: this.threadId,
            message,
            wasRunning,
          });
        } catch {
          // observer failures must never break event processing
        }
      }
    }
  }

  /**
   * Periodically consolidate durable memories from a long-running thread. Fires
   * a background reflection pass once every REFLECT_EVERY_N_TURNS completed turns
   * so learnings aren't lost on threads that never compact or get archived.
   * Watermarked + deduped downstream, so over-firing is harmless.
   */
  private maybeReflectAfterTurn(): void {
    if (++this.turnsSinceReflection < REFLECT_EVERY_N_TURNS) return;
    this.turnsSinceReflection = 0;
    scheduleReflection(this.threadId);
  }

  /**
   * The error message for a turn-ending event that represents a failure — a
   * server error, or an agent_end whose final assistant message stopped with an
   * error — or null for a normal end. Aborted turns are user cancellations, not
   * errors, so they read as a normal (null) end.
   */
  private errorEndMessage(event: HubEvent): string | null {
    if (event.type === "server_error") {
      return (event as { message?: string }).message ?? "The agent errored.";
    }
    const msg = event as {
      messages?: { role: string; stopReason?: string; errorMessage?: string }[];
    };
    const lastAssistant = msg.messages
      ?.slice()
      .reverse()
      .find((m) => m.role === "assistant");
    if (lastAssistant?.stopReason === "error" && lastAssistant.errorMessage) {
      return lastAssistant.errorMessage;
    }
    return null;
  }

  /** Derive a turn outcome from agent_end and notify the healing observer. */
  private notifyTurnEnd(event: SessionEvent): void {
    if (!agentTurnObserver) return;
    const msg = event as {
      messages?: { role: string; stopReason?: string; errorMessage?: string }[];
    };
    const lastAssistant = msg.messages
      ?.slice()
      .reverse()
      .find((m) => m.role === "assistant");
    let outcome: AgentTurnOutcome = "success";
    let errorMessage: string | undefined;
    if (lastAssistant?.stopReason === "aborted") {
      outcome = "aborted";
    } else if (
      lastAssistant?.stopReason === "error" &&
      lastAssistant.errorMessage
    ) {
      outcome = "error";
      errorMessage = lastAssistant.errorMessage;
    }
    try {
      agentTurnObserver({
        sessionId: this.sessionId,
        threadId: this.threadId,
        outcome,
        errorMessage,
      });
    } catch {
      // observer failures must never break event processing
    }
  }

  private persist(event: HubEvent) {
    // Handle server error events - don't persist to DB
    if (event.type === "server_error") return;

    // message_start - create assistant block
    if (event.type === "message_start") {
      const msg = event as { message?: { role?: string } };
      if (msg.message?.role === "assistant") {
        this.runInProgress = true;
        this.currentRunEvents = [];
        threadStatusBroadcaster.broadcast(this.threadId, "streaming");

        // Create assistant block in DB
        const blockId = insertAssistantStartBlock(this.threadId);
        // Preserve thinkingLevel across multiple message_starts in one agent turn
        // (e.g. after tool calls). pendingThinkingLevel is only set for the first call.
        const inheritedThinkingLevel = this.turnContext?.thinkingLevel;
        this.turnContext = {
          assistantBlockId: blockId,
          startTime: Date.now(),
          thinkingLevel:
            inheritedThinkingLevel ?? this.pendingThinkingLevel ?? undefined,
        };
        this.pendingThinkingLevel = null;
      }
      return;
    }

    // message_update - streaming content
    if (event.type === "message_update") {
      const msg = event as {
        assistantMessageEvent?: {
          type: string;
          delta?: string;
          partial?: { model?: string; provider?: string };
        };
      };
      const assistantEvent = msg.assistantMessageEvent;

      if (!assistantEvent || !this.turnContext?.assistantBlockId) return;

      const blockId = this.turnContext.assistantBlockId;

      if (
        assistantEvent.type === "text_delta" &&
        typeof assistantEvent.delta === "string"
      ) {
        this.textDeltaBuffer += assistantEvent.delta;
        this.scheduleDeltaFlush(blockId);
      } else if (
        assistantEvent.type === "thinking_delta" &&
        typeof assistantEvent.delta === "string"
      ) {
        this.thinkingDeltaBuffer += assistantEvent.delta;
        this.scheduleDeltaFlush(blockId);
      }

      // Track model/provider from partial info
      if (assistantEvent.partial?.model && !this.turnContext.model) {
        this.turnContext.model = assistantEvent.partial.model;
      }
      if (assistantEvent.partial?.provider && !this.turnContext.provider) {
        this.turnContext.provider = assistantEvent.partial.provider;
      }
      return;
    }

    // message_end - record token usage for the completed LLM response
    if (event.type === "message_end") {
      const msg = event as {
        message?: {
          role?: string;
          model?: string;
          provider?: string;
          usage?: {
            input: number;
            output: number;
            cacheRead: number;
            cacheWrite: number;
            totalTokens?: number;
            cost?: { total?: number };
          };
        };
      };
      const m = msg.message;
      if (m?.role !== "assistant" || !m.usage) return;
      const { input, output, cacheRead, cacheWrite } = m.usage;
      // Aborted/errored responses report whatever was actually consumed; a
      // zero-usage row carries no information, so skip those.
      if (input + output + cacheRead + cacheWrite <= 0) return;
      try {
        if (this.cachedWorkspaceId === null) {
          this.cachedWorkspaceId = getThread(this.threadId)?.workspaceId ?? "";
        }
        insertAiUsage({
          threadId: this.threadId,
          workspaceId: this.cachedWorkspaceId,
          provider: m.provider ?? "",
          model: m.model ?? "",
          inputTokens: input,
          outputTokens: output,
          cacheReadTokens: cacheRead,
          cacheWriteTokens: cacheWrite,
          totalTokens:
            m.usage.totalTokens ?? input + output + cacheRead + cacheWrite,
          cost: m.usage.cost?.total ?? 0,
        });
      } catch {
        // Usage accounting must never break event processing.
      }
      return;
    }

    // tool_execution_start - create tool block
    if (event.type === "tool_execution_start") {
      const msg = event as {
        toolCallId: string;
        toolName: string;
        args: unknown;
      };
      this.toolMetaMap.set(msg.toolCallId, {
        toolCallId: msg.toolCallId,
        toolName: msg.toolName,
        args: msg.args,
      });

      // The `question` tool blocks until the user answers — surface that pause
      // in the sidebar the same way a gated tool's approval prompt does.
      if (msg.toolName === "question") {
        threadStatusBroadcaster.broadcast(this.threadId, "awaiting", {
          reason: "question",
          detail: firstQuestionText(msg.args),
        });
      }

      // A duplicate start for a call we're already tracking would persist a
      // second block with the same toolCallId (duplicate React keys client-side)
      if (this.currentToolBlocks.has(msg.toolCallId)) return;

      // Create tool block in DB
      const blockId = insertToolBlock(
        this.threadId,
        msg.toolCallId,
        msg.toolName,
        JSON.stringify(msg.args ?? {}),
      );
      this.currentToolBlocks.set(msg.toolCallId, {
        toolBlockId: blockId,
        startTime: Date.now(),
      });
      return;
    }

    // tool_execution_end - update tool block with result
    if (event.type === "tool_execution_end") {
      const msg = event as {
        toolCallId: string;
        toolName?: string;
        args?: unknown;
        result: unknown;
        isError: boolean;
      };

      const toolContext = this.currentToolBlocks.get(msg.toolCallId);
      this.currentToolBlocks.delete(msg.toolCallId);

      // The question tool answered (or was aborted): the turn resumes, so clear
      // the "awaiting" status. agent_end will set "idle" if it doesn't continue.
      const toolName =
        msg.toolName ?? this.toolMetaMap.get(msg.toolCallId)?.toolName;
      if (toolName === "question" && this.runInProgress) {
        threadStatusBroadcaster.broadcast(this.threadId, "streaming");
      }

      if (toolContext) {
        const duration = Date.now() - toolContext.startTime;
        updateToolBlockResult(toolContext.toolBlockId, {
          status: msg.isError ? "error" : "done",
          result: JSON.stringify(msg.result),
          duration,
        });
      }
      return;
    }

    // tool_execution_update - update tool block with partial result
    if (event.type === "tool_execution_update") {
      const msg = event as {
        toolCallId: string;
        partialResult?: unknown;
      };

      const toolContext = this.currentToolBlocks.get(msg.toolCallId);
      if (toolContext && msg.partialResult !== undefined) {
        updateToolBlockPartialResult(
          toolContext.toolBlockId,
          JSON.stringify(msg.partialResult),
        );
      }
      return;
    }

    // compaction_end - persist a marker so the divider survives page refresh
    if (event.type === "compaction_end") {
      const ce = event as {
        reason: "manual" | "threshold" | "overflow";
        aborted?: boolean;
        errorMessage?: string;
      };
      if (!ce.aborted && !ce.errorMessage) {
        insertCompactionBlock(this.threadId, ce.reason);
      }
      return;
    }

    // agent_end - finalize assistant block and clear tool tracking
    if (event.type === "agent_end") {
      this.toolMetaMap.clear();
      this.currentToolBlocks.clear();
      this.flushDeltas();

      if (this.turnContext) {
        const responseTime = Date.now() - this.turnContext.startTime;
        const agentEndMsg = event as {
          messages?: {
            role: string;
            stopReason?: string;
            errorMessage?: string;
          }[];
        };
        const assistantError = agentEndMsg.messages
          ?.slice()
          .reverse()
          .find(
            (m) =>
              m.role === "assistant" &&
              m.stopReason === "error" &&
              !!m.errorMessage,
          );
        finalizeAssistantBlock(this.turnContext.assistantBlockId!, {
          responseTime,
          model: this.turnContext.model,
          provider: this.turnContext.provider,
          thinkingLevel: this.turnContext.thinkingLevel,
          errorMessage: assistantError?.errorMessage,
        });
        this.turnContext = null;
      }
      return;
    }
  }

  private emit(event: HubEvent) {
    const record: SessionEventRecord = {
      id: ++this.nextEventId,
      event,
      data: serializeEvent(event),
    };

    if (event.type === "message_start") {
      const msg = event as { message?: { role?: string } };
      if (msg.message?.role === "assistant") {
        this.runInProgress = true;
      }
    }

    if (this.runInProgress) {
      this.currentRunEvents.push(record);
    }

    this.recentEvents.push(record);
    if (this.recentEvents.length > MAX_RECENT_EVENTS) {
      this.recentEvents.shift();
    }

    // ── Track session status state ────────────────────────────────────────────
    if (event.type === "agent_start") {
      this.pendingErrorState = null;
    } else if (event.type === "compaction_start") {
      const cs = event as { reason: "manual" | "threshold" | "overflow" };
      this.isCompacting = true;
      this.compactionReason = cs.reason;
      this.pendingErrorState = null;
    } else if (event.type === "compaction_end") {
      const ce = event as { aborted?: boolean; errorMessage?: string };
      this.isCompacting = false;
      this.compactionReason = null;
      if (!ce.aborted && ce.errorMessage) {
        this.pendingErrorState = {
          title: "Compaction Failed",
          message: ce.errorMessage,
          retryable: false,
        };
      } else if (!ce.aborted) {
        this.pendingErrorState = null;
        // Prune compaction events from currentRunEvents so mid-turn reconnects
        // (parsedLastEventId === null + runInProgress) don't re-fire the success toast.
        this.currentRunEvents = this.currentRunEvents.filter(
          (r) =>
            r.event.type !== "compaction_start" &&
            r.event.type !== "compaction_end",
        );
        // History is about to be summarized away — consolidate durable memories
        // from what's still in the transcript before it's compacted.
        scheduleReflection(this.threadId);
      }
    } else if (event.type === "server_error") {
      const se = event as { message: string };
      this.pendingErrorState = {
        title: "Error",
        message: se.message,
        retryable: true,
      };
    } else if (event.type === "auto_retry_start") {
      const ar = event as { attempt: number; errorMessage: string };
      this.pendingErrorState = {
        title: "Retrying",
        message: ar.errorMessage,
        retryable: true,
        retryCount: ar.attempt,
      };
    } else if (event.type === "auto_retry_end") {
      const ar = event as { success: boolean; finalError?: string };
      if (ar.success) {
        this.pendingErrorState = null;
      } else if (ar.finalError) {
        this.pendingErrorState = {
          title: "Retry Failed",
          message: ar.finalError,
          retryable: true,
        };
      }
    }

    if (event.type === "agent_end" || event.type === "server_error") {
      this.runInProgress = false;
      // Defensive: a paused approval is normally cleared by its resolved event
      // (including the abort path); clear any stragglers so the status snapshot
      // never restores a prompt for a turn that has already ended.
      this.pendingApprovals.clear();
      // Broadcast "error" (not "idle") for failed turns so clients can notify
      // about background threads that errored without being in the foreground.
      const errorMessage = this.errorEndMessage(event);
      threadStatusBroadcaster.broadcast(
        this.threadId,
        errorMessage ? "error" : "idle",
        errorMessage ? { detail: errorMessage } : {},
      );
    }

    for (const subscriber of this.subscribers.values()) {
      try {
        subscriber.onEvent(record);
      } catch {
        subscriber.close();
      }
    }
  }
}

class SessionEventRegistry {
  private hubs = new Map<string, SessionEventHub>();

  ensure(
    sessionId: string,
    threadId: string,
    handle: ManagedSessionHandle,
    cwd?: string | null,
  ) {
    const existing = this.hubs.get(sessionId);
    if (existing) {
      existing.ensureStarted();
      return existing;
    }

    const hub = new SessionEventHub(
      sessionId,
      threadId,
      handle,
      cwd ?? null,
      () => {
        this.hubs.delete(sessionId);
        // Going idle (no subscribers) is the natural "thread is dormant" signal:
        // consolidate durable memories from it before it's torn down.
        scheduleReflection(threadId);
      },
    );
    this.hubs.set(sessionId, hub);
    hub.ensureStarted();
    return hub;
  }

  setNextThinkingLevel(sessionId: string, level: string) {
    this.hubs.get(sessionId)?.setNextThinkingLevel(level);
  }

  emitError(sessionId: string, message: string) {
    this.hubs.get(sessionId)?.emitError(message);
  }

  emitHealingStatus(sessionId: string, ev: HealingStatusEvent) {
    this.hubs.get(sessionId)?.emitHealingStatus(ev);
  }

  emitToolApprovalRequest(
    sessionId: string,
    payload: {
      toolCallId: string;
      toolName: string;
      input: Record<string, unknown>;
      scopeLabel: string;
    },
  ) {
    this.hubs.get(sessionId)?.emitToolApprovalRequest(payload);
  }

  emitToolApprovalResolved(
    sessionId: string,
    payload: {
      toolCallId: string;
      decision: "once" | "always" | "never" | "reject";
    },
  ) {
    this.hubs.get(sessionId)?.emitToolApprovalResolved(payload);
  }

  reattach(
    sessionId: string,
    handle: ManagedSessionHandle,
    cwd?: string | null,
  ) {
    this.hubs.get(sessionId)?.reattach(handle, cwd);
  }

  dismissPendingErrors(sessionId: string): void {
    this.hubs.get(sessionId)?.dismissPendingErrors();
  }

  getStatus(sessionId: string): SessionStatus {
    return (
      this.hubs.get(sessionId)?.getStatus() ?? {
        isRunning: false,
        isCompacting: false,
        compactionReason: null,
        pendingError: null,
        pendingApproval: null,
      }
    );
  }

  getLastTurnChanges(sessionId: string): string {
    return this.hubs.get(sessionId)?.getLastTurnChanges() ?? "";
  }

  getLastTurnFiles(sessionId: string): TurnFileDetail[] {
    return this.hubs.get(sessionId)?.getLastTurnFiles() ?? [];
  }

  getCurrentTurnStartTime(sessionId: string): number {
    return this.hubs.get(sessionId)?.getCurrentTurnStartTime() ?? 0;
  }

  clearLastTurnFiles(sessionId: string): void {
    this.hubs.get(sessionId)?.clearLastTurnFiles();
  }

  async dispose(sessionId: string) {
    const hub = this.hubs.get(sessionId);
    if (!hub) return;
    this.hubs.delete(sessionId);
    await hub.dispose();
  }
}

export const sessionEvents = new SessionEventRegistry();
