import { randomUUID } from "node:crypto";
import { insertMessage } from "@lamda/db";
import type { ManagedSessionHandle, SessionEvent } from "@lamda/pi-sdk";
import { messageBuffer } from "./message-buffer.js";
import { threadStatusBroadcaster } from "./thread-status-broadcaster.js";

const MAX_RECENT_EVENTS = 512;

type ServerErrorEvent = { type: "server_error"; message: string };

/** Union of all events that can be emitted through the hub */
type HubEvent = SessionEvent | ServerErrorEvent;

type MessageStartEvent = {
  message?: { role?: string };
};

type AssistantMessageDeltaEvent = {
  assistantMessageEvent?:
    | { type: "text_delta"; delta: string; partial?: { model?: string; provider?: string } }
    | { type: "thinking_delta"; delta: string; partial?: { model?: string; provider?: string } }
    | { type: string; delta?: string; partial?: { model?: string; provider?: string } };
};

type ToolExecutionStartEvent = {
  toolCallId: string;
  toolName: string;
  args: unknown;
};

type ToolExecutionEndEvent = {
  toolCallId: string;
  toolName?: string;
  args?: unknown;
  result: unknown;
  isError: boolean;
};

type SessionEventRecord = {
  id: number;
  event: HubEvent;
  data: string;
};

type CompactionEndEvent = {
  type: "compaction_end";
  reason: "manual" | "threshold" | "overflow";
  aborted: boolean;
  willRetry: boolean;
  errorMessage?: string;
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

class SessionEventHub {
  private subscribers = new Map<string, SessionEventSubscriber>();
  private recentEvents: SessionEventRecord[] = [];
  private currentRunEvents: SessionEventRecord[] = [];
  private toolMeta = new Map<string, { toolName: string; args: unknown }>();
  private generator: AsyncGenerator<SessionEvent> | null = null;
  private consumeTask: Promise<void> | null = null;
  private nextEventId = 0;
  private runInProgress = false;
  private disposed = false;
  private turnStartTime: number | null = null;
  private pendingThinkingLevel: string | null = null;

  constructor(
    private readonly sessionId: string,
    private readonly threadId: string,
    private readonly handle: ManagedSessionHandle,
  ) {}

  setNextThinkingLevel(level: string) {
    this.pendingThinkingLevel = level;
  }

  emitError(message: string) {
    if (this.disposed) return;
    const event: ServerErrorEvent = { type: "server_error", message };
    this.persist(event);
    this.emit(event);
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

    messageBuffer.flush(this.sessionId);
    this.toolMeta.clear();
    this.currentRunEvents = [];
    this.runInProgress = false;

    const subscribers = [...this.subscribers.values()];
    this.subscribers.clear();
    for (const subscriber of subscribers) {
      subscriber.close();
    }

    // Fire-and-forget: generator.return() may never resolve if the underlying
    // SDK stream is still connected. Since disposed=true already stops all
    // processing in consume(), we don't need to await cleanup here.
    this.generator?.return(undefined).catch(() => undefined);
    this.consumeTask?.catch(() => undefined);
  }

  private getReplayEvents(lastEventId?: string): SessionEventRecord[] {
    const parsedLastEventId = parseEventId(lastEventId);
    if (parsedLastEventId === null) {
      return this.runInProgress ? [...this.currentRunEvents] : [];
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

        if (event.type === "compaction_end") {
          const { errorMessage, willRetry, aborted } = event as CompactionEndEvent;
          // Only surface as server_error when compaction has permanently failed and there's
          // no active run that will produce its own agent_end error event.
          if (errorMessage && !willRetry && !aborted && !this.runInProgress) {
            this.emitError(`Compaction failed: ${errorMessage}`);
          }
        }
      }
    } catch (error) {
      if (!this.disposed) {
        const message = error instanceof Error ? error.message : String(error);
        messageBuffer.flush(this.sessionId);
        this.toolMeta.clear();
        this.runInProgress = false;
        this.currentRunEvents = [];
        this.emit({ type: "server_error", message });
      }
    }
  }

  private persist(event: HubEvent) {
    // Skip persistence for server-level error events
    if (event.type === "server_error") return;

    if (event.type === "message_start") {
      const data = event as MessageStartEvent;
      if (data.message?.role === "assistant") {
        this.turnStartTime = Date.now();
        messageBuffer.startAssistant(this.sessionId, this.threadId);
        if (this.pendingThinkingLevel) {
          messageBuffer.setThinkingLevel(this.sessionId, this.pendingThinkingLevel);
          this.pendingThinkingLevel = null;
        }
      }
      return;
    }

    if (event.type === "message_update") {
      const data = event as AssistantMessageDeltaEvent;
      if (
        data.assistantMessageEvent?.type === "text_delta" &&
        typeof data.assistantMessageEvent.delta === "string"
      ) {
        messageBuffer.appendTextDelta(
          this.sessionId,
          data.assistantMessageEvent.delta,
        );
        const partial = data.assistantMessageEvent.partial;
        if (partial?.model) messageBuffer.setModel(this.sessionId, partial.model);
        if (partial?.provider) messageBuffer.setProvider(this.sessionId, partial.provider);
      } else if (
        data.assistantMessageEvent?.type === "thinking_delta" &&
        typeof data.assistantMessageEvent.delta === "string"
      ) {
        messageBuffer.appendThinkingDelta(
          this.sessionId,
          data.assistantMessageEvent.delta,
        );
        const partial = data.assistantMessageEvent.partial;
        if (partial?.model) messageBuffer.setModel(this.sessionId, partial.model);
        if (partial?.provider) messageBuffer.setProvider(this.sessionId, partial.provider);
      }
      return;
    }

    if (event.type === "tool_execution_start") {
      const data = event as ToolExecutionStartEvent;
      this.toolMeta.set(data.toolCallId, {
        toolName: data.toolName,
        args: data.args,
      });
      return;
    }

    if (event.type === "tool_execution_end") {
      const data = event as ToolExecutionEndEvent;
      const meta = this.toolMeta.get(data.toolCallId);
      this.toolMeta.delete(data.toolCallId);
      insertMessage(
        this.threadId,
        "tool",
        JSON.stringify({
          toolCallId: data.toolCallId,
          toolName: meta?.toolName ?? data.toolName ?? "",
          args: meta?.args ?? data.args ?? {},
          result: data.result,
          status: data.isError ? "error" : "done",
        }),
      );
      return;
    }

    if (event.type === "agent_end") {
      this.toolMeta.clear();
      if (this.turnStartTime !== null) {
        messageBuffer.setResponseTime(this.sessionId, Date.now() - this.turnStartTime);
        this.turnStartTime = null;
      }
      messageBuffer.flush(this.sessionId);
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
      const data = event as MessageStartEvent;
      if (data.message?.role === "assistant") {
        this.runInProgress = true;
        this.currentRunEvents = [];
        threadStatusBroadcaster.broadcast(this.threadId, "running");
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
    const hub = this.hubs.get(sessionId);
    hub?.setNextThinkingLevel(level);
  }

  emitError(sessionId: string, message: string) {
    this.hubs.get(sessionId)?.emitError(message);
  }

  async dispose(sessionId: string) {
    const hub = this.hubs.get(sessionId);
    if (!hub) return;
    this.hubs.delete(sessionId);
    await hub.dispose();
  }
}

export const sessionEvents = new SessionEventRegistry();
export const SESSION_SSE_RETRY_MS = 1000;
