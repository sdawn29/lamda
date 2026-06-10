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
} from "@lamda/db";
import type { ManagedSessionHandle, SessionEvent } from "@lamda/pi-sdk";
import { PLAN_DIR } from "@lamda/pi-sdk";
import { gitStatus, gitStashCreate, gitWriteCheckpointRef } from "@lamda/git";
import {
  threadStatusBroadcaster,
  type ThreadStatus,
} from "./thread-status-broadcaster.js";

const MAX_RECENT_EVENTS = 512;

// ── Session status types ──────────────────────────────────────────────────────

export type SessionPendingError = {
  title: string;
  message: string;
  retryable: boolean;
  retryCount?: number;
};

export type SessionStatus = {
  isRunning: boolean;
  isCompacting: boolean;
  compactionReason: "manual" | "threshold" | "overflow" | null;
  pendingError: SessionPendingError | null;
};

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
  /** Workspace-relative path (always forward-slash, starts with `.agents/plans/`). */
  relativePath: string;
};
type HubEvent =
  | SessionEvent
  | ServerErrorEvent
  | TurnFileChangedEvent
  | PlanSavedEvent;

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

  constructor(
    private readonly sessionId: string,
    private readonly threadId: string,
    private readonly handle: ManagedSessionHandle,
    private readonly cwd: string | null = null,
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
    if (toolName !== "plan_write" && toolName !== "write") return;

    const args = meta?.args as { path?: unknown } | undefined;
    const rawPath = typeof args?.path === "string" ? args.path : null;
    if (!rawPath) return;

    const absPath = isAbsolute(rawPath) ? rawPath : resolve(this.cwd, rawPath);
    const rel = relative(this.cwd, absPath).replace(/\\/g, "/");
    // Must be inside <cwd>/.agents/plans and be a markdown file.
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
    return {
      isRunning: this.runInProgress,
      isCompacting: this.isCompacting,
      compactionReason: this.compactionReason,
      pendingError: this.pendingErrorState,
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

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelIdleDispose();

    this.toolMetaMap.clear();
    this.currentToolBlocks.clear();
    this.currentTurnEmittedFiles.clear();
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
      }
    } catch (error) {
      if (!this.disposed) {
        const message = error instanceof Error ? error.message : String(error);
        this.toolMetaMap.clear();
        this.currentToolBlocks.clear();
        this.runInProgress = false;
        this.currentRunEvents = [];
        this.emit({ type: "server_error", message });
      }
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
      threadStatusBroadcaster.broadcast(this.threadId, "idle");
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
