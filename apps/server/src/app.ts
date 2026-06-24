import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { extractToken, isAllowedOrigin, isAuthEnabled, isValidToken } from "./auth.js";
import health from "./routes/health.js";
import settings from "./routes/settings.js";
import workspaces from "./routes/workspaces.js";
import threads from "./routes/threads.js";
import sessions from "./routes/sessions.js";
import git from "./routes/git.js";
import auth from "./routes/auth.js";
import localModels from "./routes/local-models.js";
import modes from "./routes/modes.js";
import file from "./routes/file.js";
import { mcpRouter } from "./routes/mcp.js";
import { lspRouter } from "./routes/lsp.js";
import { tasksRouter } from "./routes/tasks.js";
import { automationsRouter } from "./routes/automations.js";
import terminal from "./routes/terminal.js";
import usage from "./routes/usage.js";
import memories from "./routes/memories.js";

const app = new Hono();

// Restrict CORS to localhost origins (and the no-Origin file:// renderer)
// instead of reflecting `*`, so arbitrary websites can't read API responses.
app.use(
  cors({
    origin: (origin) => (isAllowedOrigin(origin) ? origin || "*" : ""),
    allowHeaders: ["Authorization", "Content-Type"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  }),
);

// Bearer-token gate. Preflight requests carry no credentials, so let them through
// to the CORS handler above. Every other request must present a valid token.
app.use("*", async (c, next) => {
  if (c.req.method === "OPTIONS") return next();
  if (!isAuthEnabled()) return next();
  if (!isValidToken(extractToken(c.req))) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  return next();
});

app.use(logger());

app.route("/", health);
app.route("/", settings);
app.route("/", workspaces);
app.route("/", threads);
app.route("/", sessions);
app.route("/", git);
app.route("/", auth);
app.route("/", localModels);
app.route("/", modes);
app.route("/", file);
app.route("/", terminal);
app.route("/", usage);
app.route("/", memories);
app.route("/mcp", mcpRouter);
app.route("/lsp", lspRouter);
app.route("/tasks", tasksRouter);
app.route("/automations", automationsRouter);

export default app;
