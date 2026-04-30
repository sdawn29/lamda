import { existsSync } from "node:fs";
import { URL } from "node:url";
import pty from "node-pty";
import type { WebSocket } from "ws";

const TERMINAL_OUTPUT_BATCH_MS = 16;
const TERMINAL_OUTPUT_FLUSH_THRESHOLD = 8_192;
const TERMINAL_WS_BACKPRESSURE_BYTES = 256 * 1024;

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

export function handleTerminalConnection(
  ws: WebSocket,
  request: import("node:http").IncomingMessage,
) {
  const url = new URL(request.url ?? "/", "http://localhost");
  const cwd = resolveCwd(url.searchParams.get("cwd") ?? process.cwd());
  const shell = resolveShell();
  let outputBuffer = "";
  let flushTimer: NodeJS.Timeout | null = null;

  let ptyProcess: ReturnType<typeof pty.spawn> | null = null;
  try {
    ptyProcess = pty.spawn(shell, ["-l"], {
      name: "xterm-256color",
      cols: 80,
      rows: 24,
      cwd,
      env: process.env as Record<string, string>,
    });
  } catch (err) {
    console.error("[terminal] pty.spawn failed:", err);
    ws.send(`\r\n\x1b[31mFailed to start terminal: ${String(err)}\x1b[0m\r\n`);
    ws.close();
    return;
  }

  const clearFlushTimer = () => {
    if (!flushTimer) return;
    clearTimeout(flushTimer);
    flushTimer = null;
  };

  const flushBufferedOutput = () => {
    flushTimer = null;
    if (!outputBuffer) return;
    if (ws.readyState !== ws.OPEN) {
      outputBuffer = "";
      return;
    }
    if (ws.bufferedAmount > TERMINAL_WS_BACKPRESSURE_BYTES) {
      scheduleFlush();
      return;
    }
    const chunk = outputBuffer;
    outputBuffer = "";
    ws.send(chunk, (err) => {
      if (err) {
        console.error("[terminal] ws.send failed:", err);
        return;
      }
      if (outputBuffer) scheduleFlush(0);
    });
  };

  const scheduleFlush = (delay = TERMINAL_OUTPUT_BATCH_MS) => {
    if (flushTimer) {
      if (delay !== 0) return;
      clearFlushTimer();
    }
    flushTimer = setTimeout(flushBufferedOutput, delay);
  };

  ptyProcess.onData((data) => {
    outputBuffer += data;
    scheduleFlush(
      outputBuffer.length >= TERMINAL_OUTPUT_FLUSH_THRESHOLD ? 0 : TERMINAL_OUTPUT_BATCH_MS,
    );
  });

  ptyProcess.onExit(() => {
    clearFlushTimer();
    if (outputBuffer && ws.readyState === ws.OPEN) {
      try {
        ws.send(outputBuffer);
      } catch {
        // ignore send errors when socket is closing
      }
      outputBuffer = "";
    }
    try {
      ws.close();
    } catch {
      // already closed
    }
  });

  ws.on("message", (raw) => {
    if (!ptyProcess) return;
    const str = raw.toString();
    try {
      const msg = JSON.parse(str) as {
        type: string;
        data?: string;
        cols?: number;
        rows?: number;
      };
      if (msg.type === "input" && msg.data) ptyProcess.write(msg.data);
      else if (msg.type === "resize" && msg.cols && msg.rows) ptyProcess.resize(msg.cols, msg.rows);
    } catch {
      ptyProcess.write(str);
    }
  });

  ws.on("close", () => {
    clearFlushTimer();
    outputBuffer = "";
    ptyProcess?.kill();
    ptyProcess = null;
  });
}
