import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { URL } from "node:url";
import pty from "node-pty";
import type { WebSocket } from "ws";
import { getWorkspace } from "@lamda/db";

const TERMINAL_OUTPUT_BATCH_MS = 16;
const TERMINAL_OUTPUT_FLUSH_THRESHOLD = 8_192;
const TERMINAL_WS_BACKPRESSURE_BYTES = 256 * 1024;
// Rolling scrollback kept per session so a reattaching client can be replayed
// back up to date. Bounded to keep memory and replay time in check.
const SCROLLBACK_LIMIT_BYTES = 512 * 1024;
// A detached session (no client attached — e.g. the window was closed) is
// killed after this grace period so abandoned shells don't leak.
const ORPHAN_GRACE_MS = 60 * 60 * 1000;

// Persistent PTY sessions keyed by a stable client-supplied terminal id. The
// PTY outlives any individual WebSocket so the shell survives client remounts
// (workspace/tab switches, route changes, reloads) and is reattached with its
// scrollback instead of being respawned.
interface TerminalSession {
  id: string;
  pty: ReturnType<typeof pty.spawn>;
  scrollback: string;
  ws: WebSocket | null;
  outputBuffer: string;
  flushTimer: NodeJS.Timeout | null;
  orphanTimer: NodeJS.Timeout | null;
}

const sessions = new Map<string, TerminalSession>();

function resolveShell(): string {
  const envShell = process.env.SHELL;
  if (envShell && existsSync(envShell)) return envShell;
  for (const s of ["/bin/zsh", "/bin/bash", "/bin/sh"]) {
    if (existsSync(s)) return s;
  }
  return "/bin/sh";
}

function resolveCwd(requested: string): string {
  if (existsSync(requested)) return requested;
  return process.env.HOME ?? process.cwd();
}

function appendScrollback(session: TerminalSession, data: string) {
  session.scrollback += data;
  if (session.scrollback.length > SCROLLBACK_LIMIT_BYTES) {
    const overflow = session.scrollback.length - SCROLLBACK_LIMIT_BYTES;
    // Trim to the next line boundary when possible so we don't slice through an
    // escape sequence and corrupt the replayed output.
    const lineBreak = session.scrollback.indexOf("\n", overflow);
    session.scrollback = session.scrollback.slice(
      lineBreak === -1 ? overflow : lineBreak + 1,
    );
  }
}

function clearFlushTimer(session: TerminalSession) {
  if (!session.flushTimer) return;
  clearTimeout(session.flushTimer);
  session.flushTimer = null;
}

function clearOrphanTimer(session: TerminalSession) {
  if (!session.orphanTimer) return;
  clearTimeout(session.orphanTimer);
  session.orphanTimer = null;
}

function flushBufferedOutput(session: TerminalSession) {
  session.flushTimer = null;
  if (!session.outputBuffer) return;
  const ws = session.ws;
  if (!ws || ws.readyState !== ws.OPEN) {
    // No live client — the output already lives in scrollback for replay.
    session.outputBuffer = "";
    return;
  }
  if (ws.bufferedAmount > TERMINAL_WS_BACKPRESSURE_BYTES) {
    scheduleFlush(session);
    return;
  }
  const chunk = session.outputBuffer;
  session.outputBuffer = "";
  ws.send(chunk, (err) => {
    if (err) {
      console.error("[terminal] ws.send failed:", err);
      return;
    }
    if (session.outputBuffer) scheduleFlush(session, 0);
  });
}

function scheduleFlush(session: TerminalSession, delay = TERMINAL_OUTPUT_BATCH_MS) {
  if (session.flushTimer) {
    if (delay !== 0) return;
    clearFlushTimer(session);
  }
  session.flushTimer = setTimeout(() => flushBufferedOutput(session), delay);
}

/** Attach a (re)connecting client to a session and replay its scrollback. */
function attach(session: TerminalSession, ws: WebSocket) {
  // Drop any stale client still bound to this session.
  if (session.ws && session.ws !== ws) {
    try {
      session.ws.close();
    } catch {
      // already closing
    }
  }
  clearFlushTimer(session);
  clearOrphanTimer(session);
  session.ws = ws;
  session.outputBuffer = "";
  if (session.scrollback && ws.readyState === ws.OPEN) {
    ws.send(session.scrollback);
  }
}

/** Detach a client without killing the PTY, starting the orphan grace timer. */
function detach(session: TerminalSession, ws: WebSocket) {
  if (session.ws !== ws) return;
  session.ws = null;
  clearFlushTimer(session);
  session.outputBuffer = "";
  clearOrphanTimer(session);
  session.orphanTimer = setTimeout(
    () => killTerminalSession(session.id),
    ORPHAN_GRACE_MS,
  );
}

/** Terminate a session's PTY and forget it. Safe to call for unknown ids. */
export function killTerminalSession(id: string) {
  const session = sessions.get(id);
  if (!session) return;
  sessions.delete(id);
  clearFlushTimer(session);
  clearOrphanTimer(session);
  try {
    session.ws?.close();
  } catch {
    // already closed
  }
  try {
    session.pty.kill();
  } catch {
    // already exited
  }
}

function wireClient(session: TerminalSession, ws: WebSocket) {
  ws.on("message", (raw) => {
    const str = raw.toString();
    try {
      const msg = JSON.parse(str) as {
        type: string;
        data?: string;
        cols?: number;
        rows?: number;
      };
      if (msg.type === "input" && msg.data) session.pty.write(msg.data);
      else if (msg.type === "resize" && msg.cols && msg.rows)
        session.pty.resize(msg.cols, msg.rows);
      else if (msg.type === "kill") killTerminalSession(session.id);
    } catch {
      session.pty.write(str);
    }
  });

  ws.on("close", () => detach(session, ws));
}

export function handleTerminalConnection(
  ws: WebSocket,
  request: import("node:http").IncomingMessage,
) {
  const url = new URL(request.url ?? "/", "http://localhost");
  const terminalId = url.searchParams.get("terminalId");

  // Reattach to a live session when the client supplies a known id — this is
  // what keeps the shell alive across remounts instead of resetting it.
  if (terminalId) {
    const existing = sessions.get(terminalId);
    if (existing) {
      attach(existing, ws);
      wireClient(existing, ws);
      return;
    }
  }

  const cwd = resolveCwd(url.searchParams.get("cwd") ?? process.cwd());
  const workspaceId = url.searchParams.get("workspaceId");
  const shell = resolveShell();

  let ptyProcess: ReturnType<typeof pty.spawn>;
  try {
    const { PORT: _port, ...ptyEnv } = process.env;

    // Merge workspace-scoped env vars into the PTY environment.
    if (workspaceId) {
      const workspace = getWorkspace(workspaceId);
      if (workspace?.env) {
        try {
          const wsEnv = JSON.parse(workspace.env) as Record<string, string>;
          Object.assign(ptyEnv, wsEnv);
        } catch {
          /* ignore malformed JSON */
        }
      }
    }

    ptyProcess = pty.spawn(shell, ["-l"], {
      name: "xterm-256color",
      cols: 80,
      rows: 24,
      cwd,
      env: ptyEnv as Record<string, string>,
    });
  } catch (err) {
    console.error("[terminal] pty.spawn failed:", err);
    ws.send(`\r\n\x1b[31mFailed to start terminal: ${String(err)}\x1b[0m\r\n`);
    ws.close();
    return;
  }

  const id = terminalId ?? randomUUID();
  const session: TerminalSession = {
    id,
    pty: ptyProcess,
    scrollback: "",
    ws: null,
    outputBuffer: "",
    flushTimer: null,
    orphanTimer: null,
  };
  sessions.set(id, session);

  ptyProcess.onData((data) => {
    appendScrollback(session, data);
    if (session.ws && session.ws.readyState === session.ws.OPEN) {
      session.outputBuffer += data;
      scheduleFlush(
        session,
        session.outputBuffer.length >= TERMINAL_OUTPUT_FLUSH_THRESHOLD
          ? 0
          : TERMINAL_OUTPUT_BATCH_MS,
      );
    }
  });

  ptyProcess.onExit(() => {
    sessions.delete(session.id);
    clearFlushTimer(session);
    clearOrphanTimer(session);
    const client = session.ws;
    if (client && client.readyState === client.OPEN) {
      try {
        client.close();
      } catch {
        // already closing
      }
    }
  });

  attach(session, ws);
  wireClient(session, ws);
}
