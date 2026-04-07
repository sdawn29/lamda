import { insertMessage } from "@lambda/db";

interface BufferEntry {
  threadId: string;
  content: string;
}

class MessageBuffer {
  private buffers = new Map<string, BufferEntry>();

  startAssistant(sessionId: string, threadId: string) {
    this.buffers.set(sessionId, { threadId, content: "" });
  }

  appendDelta(sessionId: string, delta: string) {
    const entry = this.buffers.get(sessionId);
    if (entry) entry.content += delta;
  }

  flush(sessionId: string) {
    const entry = this.buffers.get(sessionId);
    this.buffers.delete(sessionId);
    if (!entry || !entry.content.trim()) return;
    insertMessage(entry.threadId, "assistant", entry.content);
  }

  clear(sessionId: string) {
    this.buffers.delete(sessionId);
  }
}

export const messageBuffer = new MessageBuffer();
