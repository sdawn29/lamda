import { serve } from "@hono/node-server";
import { WebSocketServer } from "ws";
import type { WebSocket } from "ws";
import { URL } from "node:url";
import { resolvePort } from "./port.js";
import app from "./app.js";
import { bootstrapSessions } from "./bootstrap.js";
import { handleTerminalConnection } from "./services/terminal-service.js";
import { handleSessionEventsWs } from "./routes/sessions.js";
import { handleGlobalEventsWs } from "./routes/health.js";
import { handleOAuthEventsWs } from "./routes/auth.js";
import { handleSessionCommands } from "./websocket/session-commands.js";

const port = resolvePort();

bootstrapSessions()
  .then(() => {
    const server = serve(
      { fetch: app.fetch, port, hostname: "127.0.0.1" },
      (info) => {
        // Must be first stdout write — apps/desktop/src/main.ts reads this to learn the port
        process.stdout.write(JSON.stringify({ ready: true, port: info.port }) + "\n");
        console.error(`[server] listening on http://127.0.0.1:${info.port}`);
      },
    );

    const wss = new WebSocketServer({ noServer: true });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (server as any).on(
      "upgrade",
      (
        request: import("node:http").IncomingMessage,
        socket: import("node:net").Socket,
        head: Buffer,
      ) => {
        const url = new URL(request.url ?? "/", "http://localhost");
        const pathname = url.pathname;

        const isKnownWsPath =
          pathname === "/terminal" ||
          pathname === "/ws/events" ||
          /^\/ws\/session\/[^/]+\/events$/.test(pathname) ||
          /^\/ws\/session\/[^/]+\/commands$/.test(pathname) ||
          /^\/ws\/auth\/oauth\/[^/]+\/events$/.test(pathname);

        if (isKnownWsPath) {
          wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit("connection", ws, request);
          });
        } else {
          socket.destroy();
        }
      },
    );

    wss.on("connection", (ws: WebSocket, request: import("node:http").IncomingMessage) => {
      const url = new URL(request.url ?? "/", "http://localhost");
      const pathname = url.pathname;

      if (pathname === "/terminal") {
        handleTerminalConnection(ws, request);
        return;
      }

      if (pathname === "/ws/events") {
        handleGlobalEventsWs(ws);
        return;
      }

      const sessionMatch = pathname.match(/^\/ws\/session\/([^/]+)\/events$/);
      if (sessionMatch) {
        const lastEventId = url.searchParams.get("lastEventId") ?? undefined;
        handleSessionEventsWs(ws, sessionMatch[1], lastEventId);
        return;
      }

      const sessionCmdMatch = pathname.match(/^\/ws\/session\/([^/]+)\/commands$/);
      if (sessionCmdMatch) {
        handleSessionCommands(ws, sessionCmdMatch[1]);
        return;
      }

      const oauthMatch = pathname.match(/^\/ws\/auth\/oauth\/([^/]+)\/events$/);
      if (oauthMatch) {
        handleOAuthEventsWs(ws, oauthMatch[1]);
        return;
      }

      ws.close();
    });
  })
  .catch((err) => {
    console.error("[bootstrap] fatal error:", err);
    process.exit(1);
  });

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
