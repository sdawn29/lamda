import { randomUUID } from "node:crypto";
import type { ManagedSessionHandle, Mode } from "@lamda/pi-sdk";

export interface StoredSession {
  handle: ManagedSessionHandle;
  createdAt: number;
  cwd: string;
  threadId: string;
  workspaceId?: string;
  /**
   * The mode whose preamble was most recently injected into this live session's
   * conversation history. Used to inject the mode preamble only when it changes
   * (first turn or a mode switch) instead of on every turn — see
   * `withModePreamble` in routes/sessions.ts. Resets to undefined when the
   * session handle is replaced (e.g. on resume), so the preamble is re-stated
   * once for the freshly-opened session.
   */
  lastInjectedMode?: Mode;
}

class SessionStore {
  private sessions = new Map<string, StoredSession>();
  private threadIndex = new Map<string, string>(); // threadId → sessionId

  create(
    handle: ManagedSessionHandle,
    cwd: string,
    threadId: string,
    workspaceId?: string,
  ): string {
    const id = randomUUID();
    this.sessions.set(id, {
      handle,
      createdAt: Date.now(),
      cwd,
      threadId,
      workspaceId,
    });
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

  getByThreadId(
    threadId: string,
  ): { sessionId: string; handle: ManagedSessionHandle } | undefined {
    const sessionId = this.threadIndex.get(threadId);
    if (!sessionId) return undefined;
    const entry = this.sessions.get(sessionId);
    if (!entry) return undefined;
    return { sessionId, handle: entry.handle };
  }

  getByWorkspaceId(
    workspaceId: string,
  ): Array<{ sessionId: string; handle: ManagedSessionHandle }> {
    const result: Array<{ sessionId: string; handle: ManagedSessionHandle }> =
      [];
    for (const [sessionId, entry] of this.sessions) {
      if (entry.workspaceId === workspaceId) {
        result.push({ sessionId, handle: entry.handle });
      }
    }
    return result;
  }

  getAll(): Array<{
    sessionId: string;
    handle: ManagedSessionHandle;
    workspaceId?: string;
  }> {
    const result: Array<{
      sessionId: string;
      handle: ManagedSessionHandle;
      workspaceId?: string;
    }> = [];
    for (const [sessionId, entry] of this.sessions) {
      result.push({
        sessionId,
        handle: entry.handle,
        workspaceId: entry.workspaceId,
      });
    }
    return result;
  }

  replaceHandle(id: string, newHandle: ManagedSessionHandle): boolean {
    const entry = this.sessions.get(id);
    if (!entry) return false;
    entry.handle.dispose();
    entry.handle = newHandle;
    entry.lastInjectedMode = undefined;
    return true;
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
