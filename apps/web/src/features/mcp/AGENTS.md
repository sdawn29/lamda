# AGENTS.md — web/src/features/mcp

> Auto-generated context for coding agents. Last updated: 2025-05-06

## Purpose

MCP (Model Context Protocol) feature module — provides UI for managing MCP server configurations per workspace via a dialog accessible from the titlebar.

## Overview

This feature enables users to configure MCP servers from a dialog accessible via the titlebar, allowing the agent to access additional tools from external MCP-compliant servers (e.g., filesystem, GitHub, Brave Search, etc.).

## Architecture

```
┌─ types.ts
│  └─ Type definitions for MCP servers and configuration
│
├─ api.ts
│  └─ Server API calls for MCP settings management
│
├─ queries.ts
│  └─ TanStack Query hooks for MCP data
│
├─ mutations.ts
│  └─ TanStack Mutations for saving MCP settings
│
├─ context.tsx
│  └─ Workspace-specific MCP state context
│
├─ index.ts
│  └─ Barrel exports for the feature module
│
└─ components/
   ├─ mcp-dialog.tsx — Main dialog with server list and add/edit form
   └─ mcp-settings-card.tsx — Card component (alternative standalone view)
```

## Access Points

### Title Bar Button

The MCP dialog is accessible via a button in the title bar:

```
TitleBar
└─ Settings icon button (rotated 45°) → Opens McpDialog
```

The button appears next to the "Open with" and "Commit" buttons.

## Key Components

### `mcp-dialog.tsx`

**Main dialog component** for managing MCP servers:

- `McpDialog` — Dialog container with server list
- `ServerListItem` — Individual server display with status
- `ServerFormDialog` — Add/Edit server configuration form
- `validateForm()` — Form validation helper

### `mcp-settings-card.tsx`

**Alternative standalone card component** for embedding in other pages (e.g., Settings).

## MCP Server Configuration

### Supported MCP Servers

| Server       | Package                                     | Description            |
| ------------ | ------------------------------------------- | ---------------------- |
| Filesystem   | `@modelcontextprotocol/server-filesystem`   | Local file operations  |
| GitHub       | `@modelcontextprotocol/server-github`       | GitHub API integration |
| Brave Search | `@modelcontextprotocol/server-brave-search` | Web search             |
| SQLite       | `@modelcontextprotocol/server-sqlite`       | SQLite database        |
| Slack        | `@modelcontextprotocol/server-slack`        | Slack messaging        |
| Puppeteer    | `@modelcontextprotocol/server-puppeteer`    | Browser automation     |

### Configuration Fields

- **Name** — Unique identifier for the server
- **Command** — Command to run (e.g., `npx`, `node`, `python`)
- **Arguments** — Space-separated arguments
- **Working Directory** — Optional directory for the process
- **Environment Variables** — Key-value pairs for API tokens, etc.
- **Description** — Optional human-readable description

## Server Status Indicators

| Status       | Icon         | Meaning                            |
| ------------ | ------------ | ---------------------------------- |
| Loading      | Spinner      | Status is being fetched            |
| Connected    | Green circle | Server is running, tools available |
| Disconnected | Gray circle  | Server not connected               |

## API Endpoints

The UI expects these server endpoints:

| Endpoint                     | Method | Purpose                      |
| ---------------------------- | ------ | ---------------------------- |
| `/mcp/settings/:workspaceId` | GET    | Fetch MCP settings           |
| `/mcp/settings/:workspaceId` | PUT    | Save MCP settings            |
| `/mcp/status/:workspaceId`   | GET    | Get server connection status |
| `/mcp/tools/:workspaceId`    | GET    | List available tools         |
| `/mcp/test-connection`       | POST   | Test server connectivity     |

## Usage

### Using the Dialog

```tsx
import { McpDialog } from "@/features/mcp"

function MyComponent() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Settings className="rotate-45" />
        MCP
      </Button>
      <McpDialog
        open={open}
        onOpenChange={setOpen}
        workspaceId="optional"
      />
    </>
  )
}
```

### Using the Card (standalone)

```tsx
import { McpSettingsCard } from "@/features/mcp"

function MySettingsPage() {
  return <McpSettingsCard workspaceId="optional" />
}
```

### Access MCP Data

```typescript
import { useMcpSettings, useMcpServerStatus, useMcpTools } from "@/features/mcp"

function MyComponent() {
  const settings = useMcpSettings("my-workspace-id")
  const status = useMcpServerStatus("my-workspace-id")
  const tools = useMcpTools("my-workspace-id")

  // ...
}
```

## State Management

- **Settings storage** — Per-workspace (defaults to "default" if not specified)
- **Connection status** — Polled periodically (every 30 seconds)
- **Optimistic updates** — Settings changes update the UI immediately
- **Rollback on error** — Failed mutations restore previous state

## Error Handling

- **Validation errors** — Displayed inline in the form
- **API errors** — Handled by TanStack Query error boundaries
- **Connection errors** — Shown on the server list item with error message

## Related

- [packages/mcp](../../packages/mcp/) — MCP SDK package for pi-coding-agent integration
- [apps/server/routes/mcp.ts](../../../server/src/routes/mcp.ts) — MCP API endpoints
- [apps/web/features/layout/AGENTS.md](../layout/AGENTS.md) — Title bar integration
