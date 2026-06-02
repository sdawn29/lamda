import { apiFetch } from "@/shared/lib/client"
import type { McpServerConfig } from "./types"

// ── MCP Settings ────────────────────────────────────────────────────────────────
//
// MCP servers are scoped application-wide — configured once and shared across
// every workspace.

export type McpToolList = Array<{ name: string; description?: string }>

export type McpSettings = { servers: McpServerConfig[] }

/**
 * Fetch MCP settings
 */
export async function fetchMcpSettings(
  signal?: AbortSignal
): Promise<McpSettings> {
  const res = await apiFetch<{ settings: McpSettings }>("/mcp/settings", {
    signal,
  })
  return res.settings
}

/**
 * Save MCP settings
 */
export async function saveMcpSettings(settings: McpSettings): Promise<void> {
  await apiFetch("/mcp/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ settings }),
  })
}

/**
 * List available tools from connected MCP servers
 */
export async function fetchMcpTools(
  signal?: AbortSignal
): Promise<Array<{ serverName: string; name: string; description?: string }>> {
  const res = await apiFetch<{ tools: Array<{ serverName: string; name: string; description?: string }> }>(
    "/mcp/tools",
    { signal }
  )
  return res.tools
}

/**
 * Test connecting to an MCP server
 */
export async function testMcpConnection(
  server: McpServerConfig
): Promise<{ success: boolean; toolCount: number; tools?: Array<{ name: string; description?: string }>; error?: string }> {
  const res = await apiFetch<{
    success: boolean
    toolCount: number
    tools?: Array<{ name: string; description?: string }>
    error?: string
  }>("/mcp/test-connection", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ server }),
  })
  return res
}

/**
 * Get MCP server status
 */
export async function fetchMcpServerStatus(
  signal?: AbortSignal
): Promise<Array<{ name: string; connected: boolean; toolCount: number; error?: string; enabled?: boolean }>> {
  const res = await apiFetch<{ servers: Array<{ name: string; connected: boolean; toolCount: number; error?: string; enabled?: boolean }> }>(
    "/mcp/status",
    { signal }
  )
  return res.servers
}

/**
 * Start an MCP server
 */
export async function startMcpServer(
  serverName: string
): Promise<{ success: boolean; error?: string; toolCount?: number }> {
  const res = await apiFetch<{ success: boolean; error?: string; toolCount?: number }>(
    `/mcp/start/${encodeURIComponent(serverName)}`,
    { method: "POST" }
  )
  return res
}

/**
 * Stop an MCP server
 */
export async function stopMcpServer(
  serverName: string
): Promise<{ success: boolean; error?: string }> {
  const res = await apiFetch<{ success: boolean; error?: string }>(
    `/mcp/stop/${encodeURIComponent(serverName)}`,
    { method: "POST" }
  )
  return res
}

/**
 * Enable or disable an MCP server
 */
export async function setMcpServerEnabled(
  serverName: string,
  enabled: boolean
): Promise<void> {
  await apiFetch(`/mcp/enabled/${encodeURIComponent(serverName)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  })
}
