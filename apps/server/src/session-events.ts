import { randomUUID } from "node:crypto";
import { insertUserBlock, insertAssistantStartBlock, insertToolBlock, appendAssistantTextDelta, appendAssistantThinkingDelta, finalizeAssistantBlock, updateToolBlockResult, updateToolBlockPartialResult, listRunningToolBlocks } from "@lamda/db";
import type { ManagedSessionHandle, SessionEvent } from "@lamda/pi-sdk";
import { threadStatusBroadcaster, type ThreadStatus } from "./thread-status-broadcaster.js";

const MAX_RECENT_EVENTS = 512;

type ServerErrorEvent = { type: "server_error"; message: string };
type HubEvent = SessionEvent | ServerErrorEvent;

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
  private turnContext: TurnContext | null = null;
  private pendingThinkingLevel: string | null = null;
  private currentToolBlocks = new Map<string, ToolContext>();

  constructor(
    private readonly sessionId: string,
    private readonly threadId: string,
    private readonly handle: ManagedSessionHandle,
  ) {
    // Start consuming immediately so we don't miss any events
    this.ensureStarted();
  }

  setNextThinkingLevel(level: string) {
    this.pendingThinkingLevel = level;
  }

  emitError(message: string) {
    if (this.disposed) return;
    const event: ServerErrorEvent = { type: "server_error", message };
    this.persist(event);
    this.emit(event);
  }

  dismissPendingErrors(): void {
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
    };

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

    this.toolMetaMap.clear();
    this.currentToolBlocks.clear();
    this.currentRunEvents = [];
    this.runInProgress = false;

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
      // New connection without lastEventId - replay all recent events
      // to allow client to restore state from server snapshot
      if (this.recentEvents.length > 0) {
        return [...this.recentEvents];
      }
      if (this.runInProgress) {
        // Include running tool blocks from DB for new subscribers
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
    const currentRunStartId = this.currentRunEvents[0]?.id;
    const currentRunEndId = this.currentRunEvents.at(-1)?.id;
    if (
      currentRunStartId !== undefined &&
      currentRunEndId !== undefined &&
      parsedLastEventId <= currentRunEndId
    ) {
      return parsedLastEventId < currentRunStartId
        ? [...this.currentRunEvents]
        : this.currentRunEvents.filter(
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
        this.turnContext = {
          assistantBlockId: blockId,
          startTime: Date.now(),
          thinkingLevel: this.pendingThinkingLevel ?? undefined,
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

      if (assistantEvent.type === "text_delta" && typeof assistantEvent.delta === "string") {
        appendAssistantTextDelta(blockId, assistantEvent.delta);
      } else if (assistantEvent.type === "thinking_delta" && typeof assistantEvent.delta === "string") {
        appendAssistantThinkingDelta(blockId, assistantEvent.delta);
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
      const msg = event as { toolCallId: string; toolName: string; args: unknown };
      this.toolMetaMap.set(msg.toolCallId, {
        toolCallId: msg.toolCallId,
        toolName: msg.toolName,
        args: msg.args,
      });

      // Create tool block in DB
      const blockId = insertToolBlock(
        this.threadId,
        msg.toolCallId,
        msg.toolName,
        JSON.stringify(msg.args ?? {})
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
          JSON.stringify(msg.partialResult)
        );
      }
      return;
    }

    // agent_end - finalize assistant block and clear tool tracking
    if (event.type === "agent_end") {
      this.toolMetaMap.clear();
      this.currentToolBlocks.clear();

      if (this.turnContext) {
        const responseTime = Date.now() - this.turnContext.startTime;
        finalizeAssistantBlock(this.turnContext.assistantBlockId!, {
          responseTime,
          model: this.turnContext.model,
          provider: this.turnContext.provider,
          thinkingLevel: this.turnContext.thinkingLevel,
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

  ensure(sessionId: string, threadId: string, handle: ManagedSessionHandle) {
    const existing = this.hubs.get(sessionId);
    if (existing) {
      existing.ensureStarted();
      return existing;
    }

    const hub = new SessionEventHub(sessionId, threadId, handle);
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

  async dispose(sessionId: string) {
    const hub = this.hubs.get(sessionId);
    if (!hub) return;
    this.hubs.delete(sessionId);
    await hub.dispose();
  }
}

export const sessionEvents = new SessionEventRegistry();
