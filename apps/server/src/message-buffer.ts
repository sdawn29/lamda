import { insertMessage } from "@lamda/db";

const ASSISTANT_MESSAGE_CONTENT_KIND = "lamda:assistant-message/v1";

interface BufferEntry {
  threadId: string;
  content: string;
  thinking: string;
  model?: string;
  provider?: string;
  thinkingLevel?: string;
  responseTime?: number;
}

function serializeAssistantMessage(entry: BufferEntry): string {
  const hasThinking = entry.thinking.trim().length > 0;
  const hasMeta =
    entry.model !== undefined ||
    entry.provider !== undefined ||
    entry.thinkingLevel !== undefined ||
    entry.responseTime !== undefined;

  if (!hasThinking && !hasMeta) return entry.content;

  return JSON.stringify({
    type: ASSISTANT_MESSAGE_CONTENT_KIND,
    content: entry.content,
    ...(hasThinking ? { thinking: entry.thinking } : {}),
    ...(entry.model !== undefined ? { model: entry.model } : {}),
    ...(entry.provider !== undefined ? { provider: entry.provider } : {}),
    ...(entry.thinkingLevel !== undefined ? { thinkingLevel: entry.thinkingLevel } : {}),
    ...(entry.responseTime !== undefined ? { responseTime: entry.responseTime } : {}),
  });
}

class MessageBuffer {
  private buffers = new Map<string, BufferEntry>();

  startAssistant(sessionId: string, threadId: string) {
    this.buffers.set(sessionId, { threadId, content: "", thinking: "" });
  }

  appendTextDelta(sessionId: string, delta: string) {
    const entry = this.buffers.get(sessionId);
    if (entry) entry.content += delta;
  }

  appendThinkingDelta(sessionId: string, delta: string) {
    const entry = this.buffers.get(sessionId);
    if (entry) entry.thinking += delta;
  }

  setModel(sessionId: string, model: string) {
    const entry = this.buffers.get(sessionId);
    if (entry && !entry.model) entry.model = model;
  }

  setProvider(sessionId: string, provider: string) {
    const entry = this.buffers.get(sessionId);
    if (entry && !entry.provider) entry.provider = provider;
  }

  setThinkingLevel(sessionId: string, level: string) {
    const entry = this.buffers.get(sessionId);
    if (entry) entry.thinkingLevel = level;
  }

  setResponseTime(sessionId: string, ms: number) {
    const entry = this.buffers.get(sessionId);
    if (entry) entry.responseTime = ms;
  }

  flush(sessionId: string) {
    const entry = this.buffers.get(sessionId);
    this.buffers.delete(sessionId);
    if (!entry || (!entry.content.trim() && !entry.thinking.trim())) return;
    insertMessage(
      entry.threadId,
      "assistant",
      serializeAssistantMessage(entry),
    );
  }

  clear(sessionId: string) {
    this.buffers.delete(sessionId);
  }
}

export const messageBuffer = new MessageBuffer();
