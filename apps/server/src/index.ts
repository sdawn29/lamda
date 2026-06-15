import { serve } from "@hono/node-server";
import { WebSocketServer } from "ws";
import type { WebSocket } from "ws";
import { URL } from "node:url";
import { resolvePort } from "./port.js";
import app from "./app.js";
import { bootstrapSessions } from "./bootstrap.js";
import { registerHealingHooks } from "./services/healing-service.js";
import { scheduleEmbeddingBackfill } from "./services/memory-embeddings.js";
import { handleTerminalConnection } from "./services/terminal-service.js";
import { handleSessionEventsWs } from "./routes/sessions.js";
import { handleGlobalEventsWs } from "./routes/health.js";
import { handleOAuthEventsWs } from "./routes/auth.js";
import { handleLspWs } from "./routes/lsp.js";
import { handleSessionCommands } from "./websocket/session-commands.js";
import { isAllowedOrigin, isAuthEnabled, isValidToken } from "./auth.js";

const port = resolvePort();

// Wire self-healing observers before any session can emit events.
registerHealingHooks();

bootstrapSessions()
  .then(() => {
    // Embed any memories missing a vector (no-op without sqlite-vec / VOYAGE_API_KEY).
    scheduleEmbeddingBackfill();

    const server = serve(
      { fetch: app.fetch, port, hostname: "127.0.0.1" },
      (info) => {
        // Must be first stdout write — apps/desktop/src/main.ts reads this to learn the port
        process.stdout.write(
          JSON.stringify({ ready: true, port: info.port }) + "\n",
        );
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
          /^\/ws\/auth\/oauth\/[^/]+\/events$/.test(pathname) ||
          /^\/ws\/workspace\/[^/]+\/lsp$/.test(pathname);

        // WebSockets are not covered by CORS, so a malicious page could otherwise
        // open ws://127.0.0.1:<port>/terminal and get a shell. Enforce the same
        // Origin allowlist and bearer token as the HTTP layer. The token rides in
        // the `?token=` query param because browser WebSockets can't set headers.
        const originAllowed = isAllowedOrigin(request.headers.origin);
        const tokenOk =
          !isAuthEnabled() || isValidToken(url.searchParams.get("token"));

        if (isKnownWsPath && originAllowed && tokenOk) {
          wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit("connection", ws, request);
          });
        } else {
          socket.destroy();
        }
      },
    );

    // Heartbeat: ping every client periodically and terminate any that fail to
    // pong, so dead sockets (laptop sleep/wake, network blips) are detected and
    // cleaned up promptly instead of lingering as half-open connections. The
    // periodic traffic also keeps idle connections from being reaped.
    const HEARTBEAT_INTERVAL_MS = 30_000;
    type KeepAliveWs = WebSocket & { isAlive?: boolean };
    const heartbeat = setInterval(() => {
      for (const client of wss.clients as Set<KeepAliveWs>) {
        if (client.isAlive === false) {
          client.terminate();
          continue;
        }
        client.isAlive = false;
        try {
          client.ping();
        } catch {
          // socket already closing
        }
      }
    }, HEARTBEAT_INTERVAL_MS);
    wss.on("close", () => clearInterval(heartbeat));

    wss.on(
      "connection",
      (ws: WebSocket, request: import("node:http").IncomingMessage) => {
        const keepAlive = ws as KeepAliveWs;
        keepAlive.isAlive = true;
        keepAlive.on("pong", () => {
          keepAlive.isAlive = true;
        });

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

        const sessionCmdMatch = pathname.match(
          /^\/ws\/session\/([^/]+)\/commands$/,
        );
        if (sessionCmdMatch) {
          handleSessionCommands(ws, sessionCmdMatch[1]);
          return;
        }

        const oauthMatch = pathname.match(
          /^\/ws\/auth\/oauth\/([^/]+)\/events$/,
        );
        if (oauthMatch) {
          handleOAuthEventsWs(ws, oauthMatch[1]);
          return;
        }

        const lspMatch = pathname.match(/^\/ws\/workspace\/([^/]+)\/lsp$/);
        if (lspMatch) {
          handleLspWs(ws, lspMatch[1]);
          return;
        }

        ws.close();
      },
    );
  })
  .catch((err) => {
    console.error("[bootstrap] fatal error:", err);
    process.exit(1);
  });

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
