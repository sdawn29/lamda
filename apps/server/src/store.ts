import { randomUUID } from "node:crypto";
import type { ManagedSessionHandle } from "@lambda/pi-sdk";

interface StoredSession {
  handle: ManagedSessionHandle;
  createdAt: number;
  cwd: string;
  threadId: string;
}

class SessionStore {
  private sessions = new Map<string, StoredSession>();
  private threadIndex = new Map<string, string>(); // threadId → sessionId

  create(handle: ManagedSessionHandle, cwd: string, threadId: string): string {
    const id = randomUUID();
    this.sessions.set(id, { handle, createdAt: Date.now(), cwd, threadId });
    this.threadIndex.set(threadId, id);
    return id;
  }

  get(id: string): StoredSession | undefined {
    return this.sessions.get(id);
  }

  has(id: string): boolean {
    return this.sessions.has(id);
  }

  getCwd(id: string): string | undefined {
    return this.sessions.get(id)?.cwd;
  }

  getThreadId(id: string): string | undefined {
    return this.sessions.get(id)?.threadId;
  }

  getByThreadId(threadId: string): { sessionId: string; handle: ManagedSessionHandle } | undefined {
    const sessionId = this.threadIndex.get(threadId);
    if (!sessionId) return undefined;
    const entry = this.sessions.get(sessionId);
    if (!entry) return undefined;
    return { sessionId, handle: entry.handle };
  }

  delete(id: string): boolean {
    const entry = this.sessions.get(id);
    if (!entry) return false;
    entry.handle.dispose();
    this.threadIndex.delete(entry.threadId);
    this.sessions.delete(id);
    return true;
  }
}

export const store = new SessionStore();
