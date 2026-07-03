# @lamda/mcp

MCP (Model Context Protocol) integration for the Lamda desktop application and pi-coding-agent.

## Features

- **Connect to multiple MCP servers** simultaneously
- **Automatic tool discovery** — tools from all servers are exposed to the agent
- **Tool execution** — seamless execution of MCP tools through the pi agent
- **Event system** — track connections, tool calls, and errors
- **Extension support** — integrates with pi as a native extension

## Installation

```bash
npm install @lamda/mcp
```

## Configuration

Create a `.pi/mcp.json` file in your project directory (or use `~/.pi/mcp.json` for global configuration):

```json
{
  "servers": [
    {
      "name": "filesystem",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "./"]
    },
    {
      "name": "github",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "your-token-here"
      }
    }
  ]
}
```

## Usage

### As a pi Extension

Copy the extension file to your extensions directory:

```bash
mkdir -p ~/.pi/agent/extensions
cp node_modules/@lamda/mcp/dist/extension.js ~/.pi/agent/extensions/
```

Then load it in pi:

```bash
pi -e ~/.pi/agent/extensions/extension.js
```

### Programmatically

```typescript
import { McpClient, createMcpClient, mcpToolToPiTool } from "@lamda/mcp";

async function main() {
  const client = createMcpClient();

  // Connect to an MCP server
  await client.connect({
    name: "filesystem",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "./"],
  });

  // List available tools
  const tools = await client.listTools();
  console.log("Available MCP tools:", tools);

  // Call a tool
  const result = await client.callTool("filesystem/readFile", {
    path: "./README.md",
  });
  console.log(result);

  // Cleanup
  await client.disconnectAll();
}

main();
```

### With the SDK

```typescript
import { createManagedSession } from "@lamda/pi-sdk";
import {
  McpClient,
  createMcpClient,
  mcpToolToPiTool,
  mcpToolNameToPiToolName,
} from "@lamda/mcp";
import { Type } from "typebox";

async function main() {
  const mcpClient = createMcpClient();

  // Connect to MCP servers from config
  await mcpClient.connect({
    name: "github",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    env: { GITHUB_TOKEN: process.env.GITHUB_TOKEN },
  });

  // Convert MCP tools to pi tools
  const mcpTools = await mcpClient.listTools();
  const piTools = mcpTools.map((tool) => ({
    name: mcpToolNameToPiToolName(tool.name),
    label: tool.name,
    description: tool.description || `MCP tool: ${tool.originalName}`,
    parameters: Type.Object({}),
    execute: async (toolCallId, params) => {
      const result = await mcpClient.callTool(
        tool.name,
        params as Record<string, unknown>,
      );
      return {
        content: result.success
          ? result.content
          : [{ type: "text", text: result.error || "Tool failed" }],
      };
    },
  }));

  // Create session with MCP tools
  const session = await createManagedSession({
    cwd: process.cwd(),
    customTools: piTools,
  });

  // Use the session...
}

main();
```

## Available MCP Servers

Here are some popular MCP servers you can use:

| Server           | Package                                         | Description            |
| ---------------- | ----------------------------------------------- | ---------------------- |
| Filesystem       | `@modelcontextprotocol/server-filesystem`       | Local file operations  |
| GitHub           | `@modelcontextprotocol/server-github`           | GitHub API integration |
| Brave Search     | `@modelcontextprotocol/server-brave-search`     | Web search             |
| SQLite           | `@modelcontextprotocol/server-sqlite`           | SQLite database        |
| AWS KB Retrieval | `@modelcontextprotocol/server-aws-kb-retrieval` | AWS Knowledge Base     |
| Slack            | `@modelcontextprotocol/server-slack`            | Slack messaging        |
| Puppeteer        | `@modelcontextprotocol/server-puppeteer`        | Browser automation     |

Find more servers at [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers)

## API Reference

### McpClient

#### `connect(config)`

Connect to an MCP server.

```typescript
await client.connect({
  name: "my-server",
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-filesystem", "./"],
  env: { MY_VAR: "value" },
  cwd: "/path/to/cwd",
});
```

#### `disconnect(serverName)`

Disconnect from a specific server.

```typescript
await client.disconnect("my-server");
```

#### `listTools()`

List all tools available from connected servers.

```typescript
const tools = await client.listTools();
```

#### `callTool(name, args)`

Call an MCP tool by name (format: `serverName/toolName`).

```typescript
const result = await client.callTool("filesystem/readFile", {
  path: "./example.txt",
});
```

#### `isConnected(serverName)`

Check if a server is connected.

```typescript
const connected = client.isConnected("my-server");
```

#### `getConnectedServers()`

Get list of connected server names.

```typescript
const servers = client.getConnectedServers();
```

#### `on(handler)` / `onType(type, handler)`

Add event listeners for MCP events.

```typescript
client.onType("tool_called", (event) => {
  console.log(`Tool called: ${event.toolName}`);
});
```

### Events

| Event Type            | Description                     |
| --------------------- | ------------------------------- |
| `server_connected`    | A server connected successfully |
| `server_disconnected` | A server disconnected           |
| `server_error`        | A server encountered an error   |
| `tool_called`         | An MCP tool was called          |
| `tool_result`         | An MCP tool returned a result   |

## License

MIT
