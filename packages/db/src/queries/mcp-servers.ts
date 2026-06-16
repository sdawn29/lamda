import { eq } from "drizzle-orm"
import { db } from "../client.js"
import { mcpServers } from "../schema.js"
import type { McpServerConfig } from "@lamda/mcp"

export interface DbMcpServer {
  id: string
  name: string
  transport: "stdio" | "http" | "sse"
  command: string | null
  args: string | null
  env: string | null
  cwd: string | null
  url: string | null
  headers: string | null
  description: string | null
  enabled: boolean
  createdAt: number
}

/**
 * Get all MCP servers (application-wide)
 */
export function getMcpServers(): DbMcpServer[] {
  return db.select().from(mcpServers).all()
}

/**
 * Get enabled MCP servers (application-wide)
 */
export function getEnabledMcpServers(): DbMcpServer[] {
  return db
    .select()
    .from(mcpServers)
    .where(eq(mcpServers.enabled, true))
    .all()
}

/**
 * Get a single MCP server by name
 */
export function getMcpServer(name: string): DbMcpServer | undefined {
  return db
    .select()
    .from(mcpServers)
    .where(eq(mcpServers.name, name))
    .get()
}

/**
 * Create or update an MCP server
 */
export function upsertMcpServer(
  config: McpServerConfig & { id?: string; enabled?: boolean }
): void {
  const id = config.id ?? crypto.randomUUID()
  const createdAt = Date.now()

  const transport = config.transport ?? (config.url ? "http" : "stdio")

  db.insert(mcpServers)
    .values({
      id,
      name: config.name,
      transport,
      command: config.command ?? null,
      args: config.args ? JSON.stringify(config.args) : null,
      env: config.env ? JSON.stringify(config.env) : null,
      cwd: config.cwd ?? null,
      url: config.url ?? null,
      headers: config.headers ? JSON.stringify(config.headers) : null,
      description: config.description ?? null,
      enabled: config.enabled ?? true,
      createdAt,
    })
    .onConflictDoUpdate({
      target: mcpServers.name,
      set: {
        transport,
        command: config.command ?? null,
        args: config.args ? JSON.stringify(config.args) : null,
        env: config.env ? JSON.stringify(config.env) : null,
        cwd: config.cwd ?? null,
        url: config.url ?? null,
        headers: config.headers ? JSON.stringify(config.headers) : null,
        description: config.description ?? null,
        enabled: config.enabled ?? true,
      },
    })
    .run()
}

/**
 * Save multiple MCP servers (replaces all existing)
 */
export function saveMcpServers(configs: McpServerConfig[]): void {
  // Preserve existing enabled states before wiping
  const existing = getMcpServers()
  const enabledMap = new Map(existing.map((s) => [s.name, s.enabled]))

  // Delete existing servers
  db.delete(mcpServers).run()

  // Insert new servers, restoring enabled state for servers that already existed
  const now = Date.now()
  for (const config of configs) {
    db.insert(mcpServers)
      .values({
        id: crypto.randomUUID(),
        name: config.name,
        transport: config.transport ?? (config.url ? "http" : "stdio"),
        command: config.command ?? null,
        args: config.args ? JSON.stringify(config.args) : null,
        env: config.env ? JSON.stringify(config.env) : null,
        cwd: config.cwd ?? null,
        url: config.url ?? null,
        headers: config.headers ? JSON.stringify(config.headers) : null,
        description: config.description ?? null,
        enabled: enabledMap.get(config.name) ?? true,
        createdAt: now,
      })
      .run()
  }
}

/**
 * Delete an MCP server
 */
export function deleteMcpServer(name: string): void {
  db.delete(mcpServers).where(eq(mcpServers.name, name)).run()
}

/**
 * Update server enabled state
 */
export function setMcpServerEnabled(name: string, enabled: boolean): void {
  db.update(mcpServers)
    .set({ enabled })
    .where(eq(mcpServers.name, name))
    .run()
}

/**
 * Convert DB record to McpServerConfig
 */
export function dbToMcpConfig(server: DbMcpServer): McpServerConfig {
  return {
    name: server.name,
    transport: server.transport ?? "stdio",
    command: server.command ?? undefined,
    args: server.args ? JSON.parse(server.args) : undefined,
    env: server.env ? JSON.parse(server.env) : undefined,
    cwd: server.cwd ?? undefined,
    url: server.url ?? undefined,
    headers: server.headers ? JSON.parse(server.headers) : undefined,
    description: server.description ?? undefined,
  }
}
