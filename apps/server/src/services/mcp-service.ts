import { McpClient, createMcpClient, mcpToolToPiTool } from "@lamda/mcp"
import type { ToolDefinition } from "@earendil-works/pi-coding-agent"
import type { McpServerConfig } from "@lamda/mcp"
import {
  getMcpServers,
  getEnabledMcpServers,
  dbToMcpConfig,
  saveMcpServers,
  deleteMcpServer,
  setMcpServerEnabled,
  getMcpServer,
} from "@lamda/db"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface McpSettings {
  servers: McpServerConfig[]
}

// ── Client Pool (in-memory for connection state) ───────────────────────────────

interface ClientEntry {
  client: McpClient
  config: McpServerConfig
  enabled: boolean
  /** Whether the server was manually stopped (don't auto-connect) */
  manuallyStopped: boolean
}

const clientPool = new Map<string, Map<string, ClientEntry>>()

// Sweep pools whose workspace no longer has any MCP servers in the DB.
setInterval(() => {
  for (const workspaceId of clientPool.keys()) {
    if (getMcpServers(workspaceId).length === 0) {
      removeAllClients(workspaceId)
    }
  }
}, 15 * 60 * 1000).unref()

function getClientEntry(workspaceId: string, config: McpServerConfig): ClientEntry {
  let pool = clientPool.get(workspaceId) ?? new Map()
  let entry = pool.get(config.name)
  if (!entry) {
    const client = createMcpClient()
    entry = { client, config, enabled: true, manuallyStopped: false }
    pool.set(config.name, entry)
    clientPool.set(workspaceId, pool)
  }
  return entry
}

function removeAllClients(workspaceId: string): void {
  clientPool.get(workspaceId)?.forEach((entry) => entry.client.disconnectAll())
  clientPool.delete(workspaceId)
}

function removeClient(workspaceId: string, name: string): void {
  const pool = clientPool.get(workspaceId)
  if (pool) {
    const entry = pool.get(name)
    if (entry) {
      entry.client.disconnectAll()
      pool.delete(name)
    }
  }
}

// ── Settings Management ──────────────────────────────────────────────────────

export function getMcpSettings(workspaceId: string): McpSettings {
  const dbServers = getMcpServers(workspaceId)
  return {
    servers: dbServers.map(dbToMcpConfig),
  }
}

export function saveMcpSettings(workspaceId: string, settings: McpSettings): void {
  // Reset manuallyStopped state when settings are saved
  const pool = clientPool.get(workspaceId)
  if (pool) {
    for (const entry of pool.values()) {
      entry.manuallyStopped = false
    }
  }
  saveMcpServers(workspaceId, settings.servers)
}

export function deleteMcpSettings(workspaceId: string): void {
  removeAllClients(workspaceId)
  // Delete from DB
  const servers = getMcpServers(workspaceId)
  for (const s of servers) {
    deleteMcpServer(workspaceId, s.name)
  }
}

// ── Server Control (start/stop) ───────────────────────────────────────────────

export async function startMcpServer(workspaceId: string, name: string): Promise<{ success: boolean; error?: string; toolCount?: number }> {
  const server = getMcpServer(workspaceId, name)
  if (!server) {
    return { success: false, error: "Server not found" }
  }

  const config = dbToMcpConfig(server)
  const entry = getClientEntry(workspaceId, config)

  // Clear manually stopped flag when starting
  entry.manuallyStopped = false
  entry.enabled = true

  if (entry.client.isConnected(name)) {
    return { success: true, toolCount: (await entry.client.listTools()).length }
  }

  try {
    await entry.client.connect(config)
    const tools = await entry.client.listTools()
    return { success: true, toolCount: tools.length }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

export async function stopMcpServer(workspaceId: string, name: string): Promise<{ success: boolean; error?: string }> {
  const pool = clientPool.get(workspaceId)
  if (!pool) {
    return { success: true }
  }

  const entry = pool.get(name)
  if (!entry) {
    return { success: true }
  }

  try {
    // Disconnect the specific server
    await entry.client.disconnect(name)
    // Mark as manually stopped so status doesn't auto-reconnect
    entry.manuallyStopped = true
    return { success: true }
  } catch (e) {
    console.error(`[MCP] Error stopping server ${name}:`, e)
    // Even if disconnect throws, mark as stopped
    entry.manuallyStopped = true
    return { success: true }
  }
}

export function setServerEnabled(workspaceId: string, name: string, enabled: boolean): void {
  setMcpServerEnabled(workspaceId, name, enabled)
  const pool = clientPool.get(workspaceId)
  if (pool) {
    const entry = pool.get(name)
    if (entry) {
      entry.enabled = enabled
      // Reset manually stopped when enabling
      if (enabled) {
        entry.manuallyStopped = false
      }
    }
  }
}

// ── Server Status ────────────────────────────────────────────────────────────

export async function getMcpServerStatus(workspaceId: string) {
  const servers = getMcpServers(workspaceId)
  return Promise.all(servers.map(async (s) => {
    try {
      const config = dbToMcpConfig(s)
      const entry = getClientEntry(workspaceId, config)

      // If disabled or manually stopped, don't auto-connect
      if (!s.enabled || entry.manuallyStopped) {
        const connected = entry.client.isConnected(s.name)
        // If still connected somehow, disconnect it
        if (connected && entry.manuallyStopped) {
          await entry.client.disconnect(s.name)
        }
        return { name: s.name, connected: false, toolCount: 0, enabled: s.enabled }
      }

      // Auto-connect if not connected
      if (!entry.client.isConnected(s.name)) {
        await entry.client.connect(config)
      }
      const tools = await entry.client.listTools()
      return { name: s.name, connected: true, toolCount: tools.length, enabled: s.enabled }
    } catch (e) {
      return { name: s.name, connected: false, toolCount: 0, error: String(e), enabled: s.enabled }
    }
  }))
}

export async function getMcpTools(workspaceId: string) {
  const dbServers = getEnabledMcpServers(workspaceId)
  const tools: Array<{ name: string; description?: string; serverName: string }> = []

  for (const s of dbServers) {
    try {
      const config = dbToMcpConfig(s)
      const entry = getClientEntry(workspaceId, config)
      
      // Don't connect servers that were manually stopped
      if (entry.manuallyStopped) {
        continue
      }
      
      if (!entry.client.isConnected(s.name)) {
        await entry.client.connect(config)
      }
      const mcpTools = await entry.client.listTools()
      for (const tool of mcpTools) {
        tools.push({ name: tool.name, description: tool.description, serverName: s.name })
      }
    } catch (e) {
      console.warn(`[MCP] Failed to list tools from ${s.name}:`, e)
    }
  }

  return tools
}

export async function testMcpConnection(server: McpServerConfig) {
  const client = createMcpClient()
  try {
    await client.connect(server)
    const tools = await client.listTools()
    return { success: true, toolCount: tools.length, tools: tools.map((t) => ({ name: t.name, description: t.description })) }
  } catch (e) {
    return { success: false, toolCount: 0, error: String(e) }
  } finally {
    await client.disconnectAll()
  }
}

// ── Tool Conversion for pi ───────────────────────────────────────────────────

export async function getMcpToolsForSession(workspaceId: string): Promise<ToolDefinition[]> {
  const dbServers = getEnabledMcpServers(workspaceId)
  const tools: ToolDefinition[] = []

  for (const s of dbServers) {
    try {
      const config = dbToMcpConfig(s)
      const entry = getClientEntry(workspaceId, config)
      
      // Don't connect servers that were manually stopped
      if (entry.manuallyStopped) {
        continue
      }
      
      if (!entry.client.isConnected(s.name)) {
        await entry.client.connect(config)
      }
      const mcpTools = await entry.client.listTools()

      for (const tool of mcpTools) {
        tools.push(mcpToolToPiTool(tool, async (name, params) => {
          const result = await entry.client.callTool(name, params)
          return { success: result.success, content: result.content as Array<{ type: "text"; text: string }>, error: result.error }
        }))
      }
    } catch (e) {
      console.error(`[MCP] Failed to load tools from ${s.name}:`, e)
    }
  }

  return tools
}