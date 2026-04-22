import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import health from "./routes/health.js";
import settings from "./routes/settings.js";
import workspaces from "./routes/workspaces.js";
import threads from "./routes/threads.js";
import sessions from "./routes/sessions.js";
import git from "./routes/git.js";
import auth from "./routes/auth.js";
import directory from "./routes/directory.js";

const app = new Hono();

app.use(cors());
app.use(logger());

app.route("/", health);
app.route("/", settings);
app.route("/", workspaces);
app.route("/", threads);
app.route("/", sessions);
app.route("/", git);
app.route("/", auth);
app.route("/", directory);

export default app;
