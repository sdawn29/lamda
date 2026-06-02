import { McpClient, createMcpClient, mcpToolToPiTool } from "@lamda/mcp";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { McpServerConfig } from "@lamda/mcp";
import {
  getMcpServers,
  getEnabledMcpServers,
  dbToMcpConfig,
  saveMcpServers,
  deleteMcpServer,
  setMcpServerEnabled,
  getMcpServer,
} from "@lamda/db";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface McpSettings {
  servers: McpServerConfig[];
}

// ── Client Pool (in-memory for connection state) ───────────────────────────────
//
// MCP servers are scoped application-wide: a single global pool of clients is
// shared across every workspace and thread.

interface ClientEntry {
  client: McpClient;
  config: McpServerConfig;
  enabled: boolean;
  /** Whether the server was manually stopped (don't auto-connect) */
  manuallyStopped: boolean;
}

const clientPool = new Map<string, ClientEntry>();

// Sweep clients that no longer correspond to a server in the DB.
setInterval(
  () => {
    const names = new Set(getMcpServers().map((s) => s.name));
    for (const name of clientPool.keys()) {
      if (!names.has(name)) {
        removeClient(name).catch((e) =>
          console.error("[MCP] sweep cleanup error:", e),
        );
      }
    }
  },
  15 * 60 * 1000,
).unref();

function getClientEntry(config: McpServerConfig): ClientEntry {
  let entry = clientPool.get(config.name);
  if (!entry) {
    const client = createMcpClient();
    entry = { client, config, enabled: true, manuallyStopped: false };
    clientPool.set(config.name, entry);
  }
  return entry;
}

async function removeClient(name: string): Promise<void> {
  const entry = clientPool.get(name);
  if (entry) {
    clientPool.delete(name);
    await entry.client.disconnectAll();
  }
}

// ── Settings Management ──────────────────────────────────────────────────────

export function getMcpSettings(): McpSettings {
  const dbServers = getMcpServers();
  return {
    servers: dbServers.map(dbToMcpConfig),
  };
}

export function saveMcpSettings(settings: McpSettings): void {
  const newNames = new Set(settings.servers.map((s) => s.name));
  for (const [name, entry] of clientPool) {
    if (!newNames.has(name)) {
      // Server was removed — disconnect and evict from pool immediately
      clientPool.delete(name);
      entry.client
        .disconnectAll()
        .catch((e) =>
          console.error(`[MCP] error disconnecting removed server "${name}":`, e),
        );
    } else {
      // Reset manuallyStopped so re-saved servers reconnect on next use
      entry.manuallyStopped = false;
    }
  }
  saveMcpServers(settings.servers);
}

export async function deleteMcpSettings(): Promise<void> {
  for (const name of clientPool.keys()) {
    await removeClient(name);
  }
  const servers = getMcpServers();
  for (const s of servers) {
    deleteMcpServer(s.name);
  }
}

// ── Server Control (start/stop) ───────────────────────────────────────────────

export async function startMcpServer(
  name: string,
): Promise<{ success: boolean; error?: string; toolCount?: number }> {
  const server = getMcpServer(name);
  if (!server) {
    return { success: false, error: "Server not found" };
  }

  const config = dbToMcpConfig(server);
  const entry = getClientEntry(config);

  // Clear manually stopped flag when starting
  entry.manuallyStopped = false;
  entry.enabled = true;

  if (entry.client.isConnected(name)) {
    return {
      success: true,
      toolCount: (await entry.client.listTools()).length,
    };
  }

  try {
    await entry.client.connect(config);
    const tools = await entry.client.listTools();
    return { success: true, toolCount: tools.length };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function stopMcpServer(
  name: string,
): Promise<{ success: boolean; error?: string }> {
  const entry = clientPool.get(name);
  if (!entry) {
    return { success: true };
  }

  try {
    // Disconnect the specific server
    await entry.client.disconnect(name);
    // Mark as manually stopped so status doesn't auto-reconnect
    entry.manuallyStopped = true;
    return { success: true };
  } catch (e) {
    console.error(`[MCP] Error stopping server ${name}:`, e);
    // Even if disconnect throws, mark as stopped
    entry.manuallyStopped = true;
    return { success: true };
  }
}

export function setServerEnabled(name: string, enabled: boolean): void {
  setMcpServerEnabled(name, enabled);
  const entry = clientPool.get(name);
  if (entry) {
    entry.enabled = enabled;
    // Reset manually stopped when enabling
    if (enabled) {
      entry.manuallyStopped = false;
    }
  }
}

// ── Server Status ────────────────────────────────────────────────────────────

export async function getMcpServerStatus() {
  const servers = getMcpServers();
  return Promise.all(
    servers.map(async (s) => {
      try {
        // Peek at the existing pool entry without creating one for disabled/stopped servers
        const existingEntry = clientPool.get(s.name);

        if (!s.enabled || existingEntry?.manuallyStopped) {
          // Disconnect if somehow still running after being manually stopped
          if (
            existingEntry?.client.isConnected(s.name) &&
            existingEntry.manuallyStopped
          ) {
            await existingEntry.client.disconnect(s.name);
          }
          return {
            name: s.name,
            connected: false,
            toolCount: 0,
            enabled: s.enabled,
          };
        }

        // Only now create/fetch the pool entry for enabled servers
        const config = dbToMcpConfig(s);
        const entry = getClientEntry(config);

        if (!entry.client.isConnected(s.name)) {
          // Fire connection in background — don't block the status response
          entry.client
            .connect(config)
            .catch((e) =>
              console.warn(`[MCP] background connect error for "${s.name}":`, e),
            );
          return {
            name: s.name,
            connected: false,
            toolCount: 0,
            enabled: s.enabled,
          };
        }
        const tools = await entry.client.listTools();
        return {
          name: s.name,
          connected: true,
          toolCount: tools.length,
          enabled: s.enabled,
        };
      } catch (e) {
        return {
          name: s.name,
          connected: false,
          toolCount: 0,
          error: String(e),
          enabled: s.enabled,
        };
      }
    }),
  );
}

export async function getMcpTools() {
  const dbServers = getEnabledMcpServers();
  const tools: Array<{
    name: string;
    description?: string;
    serverName: string;
  }> = [];

  for (const s of dbServers) {
    try {
      const config = dbToMcpConfig(s);
      const entry = getClientEntry(config);

      // Don't connect servers that were manually stopped
      if (entry.manuallyStopped) {
        continue;
      }

      if (!entry.client.isConnected(s.name)) {
        await entry.client.connect(config);
      }
      const mcpTools = await entry.client.listTools();
      for (const tool of mcpTools) {
        tools.push({
          name: tool.name,
          description: tool.description,
          serverName: s.name,
        });
      }
    } catch (e) {
      console.warn(`[MCP] Failed to list tools from ${s.name}:`, e);
    }
  }

  return tools;
}

export async function testMcpConnection(server: McpServerConfig) {
  const client = createMcpClient();
  try {
    await client.connect(server);
    const tools = await client.listTools();
    return {
      success: true,
      toolCount: tools.length,
      tools: tools.map((t) => ({ name: t.name, description: t.description })),
    };
  } catch (e) {
    return { success: false, toolCount: 0, error: String(e) };
  } finally {
    await client.disconnectAll();
  }
}

// ── Tool Conversion for pi ───────────────────────────────────────────────────

export async function getMcpToolsForSession(): Promise<ToolDefinition[]> {
  const dbServers = getEnabledMcpServers();
  const tools: ToolDefinition[] = [];

  for (const s of dbServers) {
    try {
      const config = dbToMcpConfig(s);
      const entry = getClientEntry(config);

      // Don't connect servers that were manually stopped
      if (entry.manuallyStopped) {
        continue;
      }

      if (!entry.client.isConnected(s.name)) {
        await entry.client.connect(config);
      }
      const mcpTools = await entry.client.listTools();

      for (const tool of mcpTools) {
        tools.push(
          mcpToolToPiTool(tool, async (name, params) => {
            const result = await entry.client.callTool(name, params);
            return {
              success: result.success,
              content: result.content as Array<{ type: "text"; text: string }>,
              error: result.error,
            };
          }),
        );
      }
    } catch (e) {
      console.error(`[MCP] Failed to load tools from ${s.name}:`, e);
    }
  }

  return tools;
}
