/**
 * MCP Routes
 *
 * API endpoints for managing MCP server configurations. Servers are scoped
 * application-wide — configured once and shared across every workspace.
 * Settings are persisted in SQLite via the db package.
 */

import { Hono } from "hono";
import { z } from "zod";
import {
  getMcpSettings,
  saveMcpSettings,
  testMcpConnection,
  getMcpServerStatus,
  getMcpTools,
  startMcpServer,
  stopMcpServer,
  setServerEnabled,
} from "../services/mcp-service.js";
import { refreshAllSessionTools } from "../services/session-service.js";
import { parseJsonBody } from "../lib/validate.js";

const mcpRouter = new Hono();

const mcpServerConfigSchema = z.object({
  name: z.string(),
  transport: z.enum(["stdio", "http", "sse"]).optional(),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  cwd: z.string().optional(),
  url: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  enabled: z.boolean().optional(),
});

const mcpSettingsSchema = z.object({
  settings: z.object({
    servers: z.array(
      mcpServerConfigSchema.extend({
        description: z.string().optional(),
      }),
    ),
  }),
});

const testConnectionSchema = z.object({ server: mcpServerConfigSchema });

const setEnabledSchema = z.object({ enabled: z.boolean() });

/**
 * GET /mcp/settings
 * Fetch MCP settings
 */
mcpRouter.get("/settings", async (c) => {
  const settings = getMcpSettings();
  return c.json({ settings });
});

/**
 * PUT /mcp/settings
 * Save MCP settings
 */
mcpRouter.put("/settings", async (c) => {
  const parsed = await parseJsonBody(c, mcpSettingsSchema);
  if (!parsed.ok) return parsed.response;

  saveMcpSettings(parsed.data.settings);
  await refreshAllSessionTools();
  return c.json({ success: true });
});

/**
 * GET /mcp/status
 * Get MCP server connection status
 */
mcpRouter.get("/status", async (c) => {
  const status = await getMcpServerStatus();
  return c.json({ servers: status });
});

/**
 * GET /mcp/tools
 * List available MCP tools
 */
mcpRouter.get("/tools", async (c) => {
  const tools = await getMcpTools();
  return c.json({ tools });
});

/**
 * POST /mcp/test-connection
 * Test connecting to an MCP server
 */
mcpRouter.post("/test-connection", async (c) => {
  const parsed = await parseJsonBody(c, testConnectionSchema);
  if (!parsed.ok) return parsed.response;

  const result = await testMcpConnection(parsed.data.server);
  return c.json(result);
});

/**
 * POST /mcp/start/:serverName
 * Start an MCP server
 */
mcpRouter.post("/start/:serverName", async (c) => {
  const serverName = c.req.param("serverName");

  const result = await startMcpServer(serverName);
  if (result.success) await refreshAllSessionTools();
  return c.json(result);
});

/**
 * POST /mcp/stop/:serverName
 * Stop an MCP server
 */
mcpRouter.post("/stop/:serverName", async (c) => {
  const serverName = c.req.param("serverName");

  const result = await stopMcpServer(serverName);
  if (result.success) await refreshAllSessionTools();
  return c.json(result);
});

/**
 * PATCH /mcp/enabled/:serverName
 * Enable or disable an MCP server
 */
mcpRouter.patch("/enabled/:serverName", async (c) => {
  const serverName = c.req.param("serverName");
  const parsed = await parseJsonBody(c, setEnabledSchema);
  if (!parsed.ok) return parsed.response;

  setServerEnabled(serverName, parsed.data.enabled);
  await refreshAllSessionTools();
  return c.json({ success: true });
});

export { mcpRouter };
