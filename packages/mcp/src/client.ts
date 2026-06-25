/**
 * MCP Client for connecting to Model Context Protocol servers
 */

import { createCliEnv } from "@lamda/cli-env";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { resolveTransportType } from "./types.js";
import type { McpServerConfig, McpTool, McpToolResult, McpEvent, McpEventHandler } from "./types.js";

/**
 * Build the SDK transport for a server config based on its transport type.
 *
 * For `http` we use Streamable HTTP (the modern MCP transport); for `sse` the
 * legacy HTTP+SSE transport. Custom headers (e.g. Authorization) are attached
 * to every request, including the SSE GET stream.
 */
function createTransport(config: McpServerConfig): Transport {
  const transportType = resolveTransportType(config);

  if (transportType === "http" || transportType === "sse") {
    if (!config.url) {
      throw new Error(`MCP server "${config.name}" is missing a url for ${transportType} transport`);
    }

    let url: URL;
    try {
      url = new URL(config.url);
    } catch {
      throw new Error(`MCP server "${config.name}" has an invalid url: ${config.url}`);
    }

    const headers = config.headers;
    const requestInit: RequestInit | undefined = headers ? { headers } : undefined;

    if (transportType === "sse") {
      return new SSEClientTransport(url, {
        requestInit,
        // The SSE GET stream goes through EventSource, which won't pick up
        // requestInit headers — inject them via a custom fetch so auth works.
        ...(headers
          ? {
              eventSourceInit: {
                fetch: (input: string | URL, init?: RequestInit) =>
                  fetch(input, { ...init, headers: { ...init?.headers, ...headers } }),
              },
            }
          : {}),
      });
    }

    return new StreamableHTTPClientTransport(url, { requestInit });
  }

  // stdio (default).
  if (!config.command) {
    throw new Error(`MCP server "${config.name}" is missing a command for stdio transport`);
  }

  // In a packaged Electron app, macOS provides only a minimal PATH
  // (/usr/bin:/bin:/usr/sbin:/sbin). Use the login-shell PATH so that
  // commands installed via nvm/volta/fnm/mise/asdf/homebrew all resolve.
  return new StdioClientTransport({
    command: config.command,
    args: config.args,
    env: createCliEnv(config.env),
    cwd: config.cwd,
  });
}

/**
 * Internal server connection state
 */
interface ServerConnection {
  client: Client;
  transport: Transport;
  config: McpServerConfig;
}

/**
 * MCP Client class for managing connections to multiple MCP servers
 */
export class McpClient {
  private servers: Map<string, ServerConnection> = new Map();
  private connecting: Map<string, Promise<void>> = new Map();
  private eventHandlers: McpEventHandler[] = [];
  private eventHandlersByType: Map<string, McpEventHandler[]> = new Map();

  /**
   * Connect to an MCP server. The transport (stdio / http / sse) is selected
   * from the config; see {@link createTransport}.
   */
  async connect(config: McpServerConfig): Promise<void> {
    if (this.servers.has(config.name)) {
      return;
    }

    // Coalesce concurrent connect() calls — return the in-flight promise instead of spawning again
    const inflight = this.connecting.get(config.name);
    if (inflight) return inflight;

    const promise = this._doConnect(config).finally(() => {
      this.connecting.delete(config.name);
    });
    this.connecting.set(config.name, promise);
    return promise;
  }

  private async _doConnect(config: McpServerConfig): Promise<void> {
    try {
      const transport = createTransport(config);

      const client = new Client(
        { name: `lambda-mcp-${config.name}`, version: "1.0.0" },
        { capabilities: {} }
      );

      // Enforce a 30-second connection timeout so a hung process never blocks indefinitely
      let connectTimeoutId: ReturnType<typeof setTimeout> | undefined;
      const connectionTimeout = new Promise<never>((_, reject) => {
        connectTimeoutId = setTimeout(
          () => reject(new Error(`Connection to MCP server "${config.name}" timed out after 30s`)),
          30_000
        );
      });

      try {
        await Promise.race([client.connect(transport), connectionTimeout]);
      } catch (e) {
        clearTimeout(connectTimeoutId);
        try { await transport.close(); } catch { /* best-effort cleanup */ }
        throw e;
      }
      clearTimeout(connectTimeoutId);

      this.servers.set(config.name, {
        client,
        transport,
        config,
      });

      this.emit({
        type: "server_connected",
        serverName: config.name,
        timestamp: Date.now(),
      });

      console.log(`MCP server "${config.name}" connected`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.emit({
        type: "server_error",
        serverName: config.name,
        error: errorMessage,
        timestamp: Date.now(),
      });
      throw new Error(`Failed to connect to MCP server "${config.name}": ${errorMessage}`);
    }
  }

  /**
   * Disconnect from an MCP server
   */
  async disconnect(serverName: string): Promise<void> {
    const connection = this.servers.get(serverName);
    if (!connection) {
      return;
    }

    // Remove before closing so isConnected() reflects the new state even if close() throws
    this.servers.delete(serverName);

    try {
      await connection.client.close();

      this.emit({
        type: "server_disconnected",
        serverName,
        timestamp: Date.now(),
      });

      console.log(`MCP server "${serverName}" disconnected`);
    } catch (error) {
      console.error(`Error disconnecting from MCP server "${serverName}":`, error);
    }
  }

  /**
   * Disconnect from all servers
   */
  async disconnectAll(): Promise<void> {
    const serverNames = Array.from(this.servers.keys());
    await Promise.all(serverNames.map((name) => this.disconnect(name)));
  }

  /**
   * Get list of available tools from all connected servers
   */
  async listTools(): Promise<McpTool[]> {
    const allTools: McpTool[] = [];

    for (const [serverName, connection] of this.servers) {
      try {
        const response = await connection.client.listTools();

        for (const tool of response.tools || []) {
          allTools.push({
            name: `${serverName}/${tool.name}`,
            description: tool.description,
            serverName,
            originalName: tool.name,
            inputSchema: tool.inputSchema as { type: "object"; properties?: Record<string, unknown>; required?: string[] },
          });
        }
      } catch (error) {
        console.error(`Error listing tools from "${serverName}":`, error);
      }
    }

    return allTools;
  }

  /**
   * Call an MCP tool by name (with server prefix)
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
    const slashIndex = name.indexOf("/");
    const serverName = slashIndex !== -1 ? name.slice(0, slashIndex) : "";
    const toolName = slashIndex !== -1 ? name.slice(slashIndex + 1) : "";

    if (!serverName || !toolName) {
      return {
        success: false,
        content: [{ type: "text", text: `Invalid tool name: ${name}. Expected format: "serverName/toolName"` }],
        error: "Invalid tool name format",
      };
    }

    const connection = this.servers.get(serverName);
    if (!connection) {
      return {
        success: false,
        content: [{ type: "text", text: `MCP server "${serverName}" not connected` }],
        error: `Server not connected: ${serverName}`,
      };
    }

    this.emit({
      type: "tool_called",
      serverName,
      toolName: name,
      data: args,
      timestamp: Date.now(),
    });

    try {
      const result = await connection.client.callTool(
        { name: toolName, arguments: args },
        CallToolResultSchema
      );

      this.emit({
        type: "tool_result",
        serverName,
        toolName: name,
        data: result,
        timestamp: Date.now(),
      });

      // Convert MCP result to our format
      const contentItems = Array.isArray(result.content) ? result.content : [];
      const content = this.formatToolContent(contentItems as Array<{ type: string; text?: string; data?: string; mimeType?: string }>);
      return {
        success: !result.isError,
        content,
        details: result as unknown as Record<string, unknown>,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        content: [{ type: "text", text: errorMessage }],
        error: errorMessage,
      };
    }
  }

  /**
   * Format tool content from MCP response
   */
  private formatToolContent(
    content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>
  ): Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> {
    return content.map((item) => {
      if (item.type === "text" && item.text !== undefined) {
        return { type: "text" as const, text: item.text };
      }
      if (item.type === "image" && item.data && item.mimeType) {
        return { type: "image" as const, data: item.data, mimeType: item.mimeType };
      }
      return { type: "text" as const, text: JSON.stringify(item) };
    });
  }

  /**
   * Check if a server is connected
   */
  isConnected(serverName: string): boolean {
    return this.servers.has(serverName);
  }

  /**
   * Get all connected server names
   */
  getConnectedServers(): string[] {
    return Array.from(this.servers.keys());
  }

  /**
   * Add an event handler
   */
  on(handler: McpEventHandler): () => void {
    this.eventHandlers.push(handler);
    return () => {
      const index = this.eventHandlers.indexOf(handler);
      if (index > -1) this.eventHandlers.splice(index, 1);
    };
  }

  /**
   * Add an event handler for a specific event type
   */
  onType(type: string, handler: McpEventHandler): () => void {
    let handlers = this.eventHandlersByType.get(type);
    if (!handlers) {
      handlers = [];
      this.eventHandlersByType.set(type, handlers);
    }
    handlers.push(handler);
    return () => {
      const index = handlers!.indexOf(handler);
      if (index > -1) handlers!.splice(index, 1);
    };
  }

  /**
   * Emit an event to all handlers
   */
  private emit(event: McpEvent): void {
    // Call type-specific handlers
    const typeHandlers = this.eventHandlersByType.get(event.type);
    if (typeHandlers) {
      for (const handler of typeHandlers) {
        try {
          handler(event);
        } catch (e) {
          console.error("Error in MCP event handler:", e);
        }
      }
    }

    // Call global handlers
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (e) {
        console.error("Error in MCP event handler:", e);
      }
    }
  }

  /**
   * Check if client has any active connections
   */
  hasConnections(): boolean {
    return this.servers.size > 0;
  }
}

/**
 * Create a new MCP client instance
 */
export function createMcpClient(): McpClient {
  return new McpClient();
}
