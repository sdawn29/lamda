# AGENTS.md — packages/mcp

> Auto-generated context for coding agents. Last updated: 2026-05-11

## Purpose

MCP (Model Context Protocol) client integration for pi-coding-agent. Provides stdio-based connections to MCP servers, tool discovery, and conversion of MCP tools to pi tool format.

## Quick Reference

| Action            | Command                      |
| ----------------- | ---------------------------- |
| Type-check        | `npm run check-types -w mcp` |
| Build (via turbo) | `npm run build` (from root)  |

## Architecture

```
packages/mcp/src/
├── index.ts      — Public exports
├── types.ts      — TypeScript interfaces and types
├── client.ts     — McpClient class implementation
└── converter.ts  — MCP to pi tool name conversion
```

## Public API

### McpClient Class

```typescript
class McpClient {
  // Connection management
  connect(config: McpServerConfig): Promise<void>;
  disconnect(serverName: string): Promise<void>;
  disconnectAll(): Promise<void>;
  isConnected(serverName: string): boolean;
  getConnectedServers(): string[];

  // Tool operations
  listTools(): Promise<McpTool[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult>;

  // Event system
  on(handler: McpEventHandler): () => void;
  onType(type: string, handler: McpEventHandler): () => void;
}
```

### Factory Function

```typescript
function createMcpClient(): McpClient;
```

### Types

```typescript
interface McpServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  description?: string;
}

interface McpTool {
  name: string; // Format: "serverName/toolName"
  description?: string;
  serverName: string;
  originalName: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

type McpEventType =
  | "server_connected"
  | "server_disconnected"
  | "server_error"
  | "tool_called"
  | "tool_result";

interface McpToolResult {
  success: boolean;
  content: Array<
    | { type: "text"; text: string }
    | { type: "image"; data: string; mimeType: string }
  >;
  details?: Record<string, unknown>;
  error?: string;
}
```

## Key Conventions

- **ESM module** (`"type": "module"`)
- **Source-only exports** — no compiled dist; consumers import from `.ts` files directly
- **Event-driven architecture** — server connection/disconnection and tool calls emit typed events
- **Tool naming convention** — MCP tools are prefixed with server name (`"serverName/toolName"`)

## Dependencies

| Package                     | Version | Purpose                            |
| --------------------------- | ------- | ---------------------------------- |
| `@modelcontextprotocol/sdk` | ^1.0.0  | MCP protocol client implementation |

## Gotchas

- **stdio transport only** — no HTTP/WebSocket transport support
- **No reconnection logic** — if a server disconnects, you must manually reconnect
- **Tool name parsing** — `callTool()` expects `"serverName/toolName"` format; returns error for invalid format
- **Content type handling** — only `text` and `image` content types are supported; other types stringify to JSON

## Usage Example

```typescript
import { createMcpClient, mcpToolToPiTool } from "@lamda/mcp";

const client = createMcpClient();

// Connect to a filesystem MCP server
await client.connect({
  name: "filesystem",
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/project"],
  cwd: "/working/directory",
});

// Listen for events
client.onType("server_connected", (event) => {
  console.log(`Connected to ${event.serverName}`);
});

// List and call tools
const tools = await client.listTools();
const result = await client.callTool("filesystem/readFile", {
  path: "/path/to/file.txt",
});
```

## Examples

| File                        | Purpose                                                     |
| --------------------------- | ----------------------------------------------------------- |
| `examples/mcp.example.json` | Sample MCP server configuration for use with `.pi/mcp.json` |

## Related

- [apps/web/src/features/mcp](../apps/web/src/features/mcp/AGENTS.md) — React UI integration for MCP servers
- [Root AGENTS.md](../AGENTS.md) — Project overview
