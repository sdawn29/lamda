import { randomUUID } from "node:crypto";
import { insertMessage } from "@lambda/db";
import type { ManagedSessionHandle, SessionEvent } from "@lambda/pi-sdk";
import { messageBuffer } from "./message-buffer.js";

const MAX_RECENT_EVENTS = 512;

type MessageStartEvent = {
  message?: { role?: string };
};

type AssistantMessageDeltaEvent = {
  assistantMessageEvent?:
    | { type: "text_delta"; delta: string }
    | { type: "thinking_delta"; delta: string }
    | { type: string; delta?: string };
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
  event: SessionEvent;
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

function serializeEvent(event: SessionEvent): string {
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

  constructor(
    private readonly sessionId: string,
    private readonly threadId: string,
    private readonly handle: ManagedSessionHandle,
  ) {}

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

    const generator = this.generator;
    if (generator) {
      await generator.return(undefined).catch(() => undefined);
    }

    await this.consumeTask?.catch(() => undefined);
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
      }
    } catch (error) {
      if (!this.disposed) {
        const message = error instanceof Error ? error.message : String(error);
        messageBuffer.flush(this.sessionId);
        this.toolMeta.clear();
        this.runInProgress = false;
        this.currentRunEvents = [];
        this.emit({ type: "sdk_error", message });
      }
    }
  }

  private persist(event: SessionEvent) {
    if (event.type === "message_start") {
      const data = event as MessageStartEvent;
      if (data.message?.role === "assistant") {
        messageBuffer.startAssistant(this.sessionId, this.threadId);
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
      } else if (
        data.assistantMessageEvent?.type === "thinking_delta" &&
        typeof data.assistantMessageEvent.delta === "string"
      ) {
        messageBuffer.appendThinkingDelta(
          this.sessionId,
          data.assistantMessageEvent.delta,
        );
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
      messageBuffer.flush(this.sessionId);
      return;
    }

    if (event.type === "sdk_error") {
      this.toolMeta.clear();
      messageBuffer.flush(this.sessionId);
    }
  }

  private emit(event: SessionEvent) {
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
      }
    }

    if (this.runInProgress) {
      this.currentRunEvents.push(record);
    }

    this.recentEvents.push(record);
    if (this.recentEvents.length > MAX_RECENT_EVENTS) {
      this.recentEvents.shift();
    }

    if (event.type === "agent_end" || event.type === "sdk_error") {
      this.runInProgress = false;
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

  async dispose(sessionId: string) {
    const hub = this.hubs.get(sessionId);
    if (!hub) return;
    this.hubs.delete(sessionId);
    await hub.dispose();
  }
}

export const sessionEvents = new SessionEventRegistry();
export const SESSION_SSE_RETRY_MS = 1000;
