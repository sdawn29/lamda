/**
 * MCP Routes
 *
 * API endpoints for managing MCP server configurations. Servers are scoped
 * application-wide — configured once and shared across every workspace.
 * Settings are persisted in SQLite via the db package.
 */

import { Hono } from "hono";
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

const mcpRouter = new Hono();

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
  const { settings } = await c.req.json<{
    settings: {
      servers: Array<{
        name: string;
        command: string;
        args?: string[];
        env?: Record<string, string>;
        cwd?: string;
        description?: string;
      }>;
    };
  }>();

  saveMcpSettings(settings);
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
  const { server } = await c.req.json<{
    server: {
      name: string;
      command: string;
      args?: string[];
      env?: Record<string, string>;
      cwd?: string;
    };
  }>();

  const result = await testMcpConnection(server);
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
  const { enabled } = await c.req.json<{ enabled: boolean }>();

  setServerEnabled(serverName, enabled);
  await refreshAllSessionTools();
  return c.json({ success: true });
});

export { mcpRouter };
