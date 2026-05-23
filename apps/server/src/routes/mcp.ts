/**
 * MCP Routes
 * 
 * API endpoints for managing MCP server configurations per workspace.
 * Settings are persisted in SQLite via the db package.
 */

import { Hono } from "hono"
import {
  getMcpSettings,
  saveMcpSettings,
  testMcpConnection,
  getMcpServerStatus,
  getMcpTools,
  startMcpServer,
  stopMcpServer,
  setServerEnabled,
} from "../services/mcp-service.js"
import { collectCustomTools } from "../services/session-service.js"
import { getWorkspace } from "@lamda/db"
import { store } from "../store.js"

async function refreshSessionTools(workspaceId: string) {
  const ws = getWorkspace(workspaceId)
  if (!ws) return
  const tools = await collectCustomTools(workspaceId, ws.path)
  for (const { handle } of store.getByWorkspaceId(workspaceId)) {
    handle.setCustomTools(tools)
  }
}

const mcpRouter = new Hono()

/**
 * GET /mcp/settings/:workspaceId
 * Fetch MCP settings for a workspace
 */
mcpRouter.get("/settings/:workspaceId", async (c) => {
  const workspaceId = c.req.param("workspaceId")
  const settings = getMcpSettings(workspaceId)
  return c.json({ settings })
})

/**
 * PUT /mcp/settings/:workspaceId
 * Save MCP settings for a workspace
 */
mcpRouter.put("/settings/:workspaceId", async (c) => {
  const workspaceId = c.req.param("workspaceId")
  const { settings } = await c.req.json<{
    settings: {
      servers: Array<{
        name: string
        command: string
        args?: string[]
        env?: Record<string, string>
        cwd?: string
        description?: string
      }>
    }
  }>()

  saveMcpSettings(workspaceId, settings)
  await refreshSessionTools(workspaceId)
  return c.json({ success: true })
})

/**
 * GET /mcp/status/:workspaceId
 * Get MCP server connection status
 */
mcpRouter.get("/status/:workspaceId", async (c) => {
  const workspaceId = c.req.param("workspaceId")
  
  const status = await getMcpServerStatus(workspaceId)
  
  return c.json({ servers: status })
})

/**
 * GET /mcp/tools/:workspaceId
 * List available MCP tools
 */
mcpRouter.get("/tools/:workspaceId", async (c) => {
  const workspaceId = c.req.param("workspaceId")
  
  const tools = await getMcpTools(workspaceId)
  
  return c.json({ tools })
})

/**
 * POST /mcp/test-connection
 * Test connecting to an MCP server
 */
mcpRouter.post("/test-connection", async (c) => {
  const { server } = await c.req.json<{
    server: {
      name: string
      command: string
      args?: string[]
      env?: Record<string, string>
      cwd?: string
    }
  }>()

  const result = await testMcpConnection(server)
  return c.json(result)
})

/**
 * POST /mcp/start/:workspaceId/:serverName
 * Start an MCP server
 */
mcpRouter.post("/start/:workspaceId/:serverName", async (c) => {
  const workspaceId = c.req.param("workspaceId")
  const serverName = c.req.param("serverName")
  
  const result = await startMcpServer(workspaceId, serverName)
  if (result.success) await refreshSessionTools(workspaceId)
  return c.json(result)
})

/**
 * POST /mcp/stop/:workspaceId/:serverName
 * Stop an MCP server
 */
mcpRouter.post("/stop/:workspaceId/:serverName", async (c) => {
  const workspaceId = c.req.param("workspaceId")
  const serverName = c.req.param("serverName")
  
  const result = await stopMcpServer(workspaceId, serverName)
  if (result.success) await refreshSessionTools(workspaceId)
  return c.json(result)
})

/**
 * PATCH /mcp/enabled/:workspaceId/:serverName
 * Enable or disable an MCP server
 */
mcpRouter.patch("/enabled/:workspaceId/:serverName", async (c) => {
  const workspaceId = c.req.param("workspaceId")
  const serverName = c.req.param("serverName")
  const { enabled } = await c.req.json<{ enabled: boolean }>()
  
  setServerEnabled(workspaceId, serverName, enabled)
  await refreshSessionTools(workspaceId)
  return c.json({ success: true })
})

export { mcpRouter }