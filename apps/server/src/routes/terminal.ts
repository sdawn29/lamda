import { Hono } from "hono";
import { killTerminalSession } from "../services/terminal-service.js";

const terminal = new Hono();

// Explicitly terminate a persistent PTY session. The client calls this when a
// tab is actually closed (vs. merely unmounted by a workspace/route switch,
// which only detaches and leaves the shell running for reattachment).
terminal.delete("/terminal/session/:id", (c) => {
  killTerminalSession(c.req.param("id"));
  return new Response(null, { status: 204 });
});

export default terminal;
