import { serve } from "@hono/node-server";
import { WebSocketServer } from "ws";
import type { WebSocket } from "ws";
import { URL } from "node:url";
import { existsSync } from "node:fs";
import pty from "node-pty";
import { resolvePort } from "./port.js";
import app from "./app.js";
import { bootstrapSessions } from "./bootstrap.js";

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

const port = resolvePort();

bootstrapSessions()
  .then(() => {
    const server = serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, (info) => {
      // Must be first stdout write — apps/desktop/src/main.ts reads this to learn the port
      process.stdout.write(JSON.stringify({ ready: true, port: info.port }) + "\n");
      console.error(`[server] listening on http://127.0.0.1:${info.port}`);
    });

    // Attach WebSocket server for terminal support
    const wss = new WebSocketServer({ noServer: true });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (server as any).on("upgrade", (request: import("node:http").IncomingMessage, socket: import("node:net").Socket, head: Buffer) => {
      const url = new URL(request.url ?? "/", "http://localhost");
      if (url.pathname === "/terminal") {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit("connection", ws, request);
        });
      } else {
        socket.destroy();
      }
    });

    wss.on("connection", (ws: WebSocket, request: import("node:http").IncomingMessage) => {
      const url = new URL(request.url ?? "/", "http://localhost");
      const cwd = resolveCwd(url.searchParams.get("cwd") ?? process.cwd());
      const shell = resolveShell();

      let ptyProcess: ReturnType<typeof pty.spawn> | null = null;
      try {
        ptyProcess = pty.spawn(shell, [], {
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

      ptyProcess.onData((data) => {
        if (ws.readyState === ws.OPEN) {
          ws.send(data);
        }
      });

      ptyProcess.onExit(() => {
        try { ws.close(); } catch { /* already closed */ }
      });

      ws.on("message", (raw) => {
        if (!ptyProcess) return;
        const str = raw.toString();
        try {
          const msg = JSON.parse(str) as { type: string; data?: string; cols?: number; rows?: number };
          if (msg.type === "input" && msg.data) {
            ptyProcess.write(msg.data);
          } else if (msg.type === "resize" && msg.cols && msg.rows) {
            ptyProcess.resize(msg.cols, msg.rows);
          }
        } catch {
          ptyProcess.write(str);
        }
      });

      ws.on("close", () => {
        ptyProcess?.kill();
        ptyProcess = null;
      });
    });
  })
  .catch((err) => {
    console.error("[bootstrap] fatal error:", err);
    process.exit(1);
  });

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
