# MCP Guide

MCP (Model Context Protocol) allows the Pi coding agent to connect to external tools and services through MCP servers. This extends the agent's capabilities beyond built-in tools.

## Overview

```
┌─────────────────────────────────────────────────────────────────┐
│ MCP Servers                                                     │
│                                                                 │
│ ┌───────────────────────────────────────────────────────────┐ │
│ │ ● Filesystem           Connected                          │ │
│ │   Access local files and directories                       │ │
│ │   Command: npx -y @modelcontextprotocol/server-filesystem │ │
│ │                                      [Edit] [Remove]      │ │
│ └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌───────────────────────────────────────────────────────────┐ │
│ │ ● GitHub                 Connected                          │ │
│ │   GitHub API integration                                  │ │
│ │   Command: npx -y @modelcontextprotocol/server-github     │ │
│ │   Env: GITHUB_TOKEN=***                                   │ │
│ │                                      [Edit] [Remove]       │ │
│ └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌───────────────────────────────────────────────────────────┐ │
│ │ ● Brave Search           Disconnected                     │ │
│ │   Web search capabilities                                  │ │
│ │   Command: npx -y @modelcontextprotocol/server-brave-search│ │
│ │                                      [Edit] [Remove]       │ │
│ └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│ [+ Add Server]                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## What is MCP?

MCP (Model Context Protocol) is a standardized protocol that allows AI agents to connect to external tools. It's like an API bridge that makes external services available as tools the agent can call.

### How It Works

```
┌──────────────┐      MCP Protocol       ┌──────────────┐
│   lamda      │ ◄───────────────────► │ MCP Server   │
│  (Client)    │                        │  (e.g., GitHub)│
└──────────────┘                        └──────────────┘
      │                                        │
      ▼                                        ▼
┌──────────────┐                        ┌──────────────┐
│ Pi Agent     │                        │ GitHub API   │
│ (Can call    │                        │ (External    │
│  MCP tools) │                        │  Service)    │
└──────────────┘                        └──────────────┘
```

## Accessing MCP Settings

### Title Bar Button

Click the **MCP** button (gear icon with rotation) in the title bar to open the MCP dialog.

### Settings Page

1. Go to **Settings** → **MCP**
2. View and manage MCP server configurations

## Supported Servers

### Official MCP Servers

| Server | Package | Description | Capabilities |
|--------|---------|-------------|--------------|
| **Filesystem** | `@modelcontextprotocol/server-filesystem` | Local file operations | Read/write files, list directories |
| **GitHub** | `@modelcontextprotocol/server-github` | GitHub API | Issues, PRs, repos, search |
| **Brave Search** | `@modelcontextprotocol/server-brave-search` | Web search | Search the web |
| **SQLite** | `@modelcontextprotocol/server-sqlite` | Database operations | Query SQLite databases |
| **Slack** | `@modelcontextprotocol/server-slack` | Slack messaging | Send messages, list channels |
| **Puppeteer** | `@modelcontextprotocol/server-puppeteer` | Browser automation | Control a browser |

### Community Servers

Many community MCP servers are available. Search for "mcp-server" on npm or GitHub.

## Adding a Server

### Step-by-Step

1. Click **+ Add Server**
2. Fill in the configuration:

```
┌─────────────────────────────────────────────────────────────────┐
│ Add MCP Server                                                  │
│                                                                 │
│ Name: ┌────────────────────────────────── ▾                    │
│       │ Filesystem                        │                    │
│       │ GitHub                            │                    │
│       │ Brave Search                      │                    │
│       │ Custom...                         │                    │
│       └───────────────────────────────────┘                    │
│                                                                 │
│ Command: ┌────────────────────────────────────────────── ▾    │
│          │ npx                                            │    │
│          └────────────────────────────────────────────────┘    │
│                                                                 │
│ Arguments: ┌──────────────────────────────────────────────┐   │
│            │ -y @modelcontextprotocol/server-filesystem   │   │
│            └──────────────────────────────────────────────┘   │
│                                                                 │
│ Working Directory: ┌──────────────────────────────────────┐   │
│                    │ /Users/me/projects/my-project         │   │
│                    └──────────────────────────────────────┘   │
│                    [Browse]                                   │
│                                                                 │
│ Environment Variables:                                          │
│ ┌───────────────────────────────────────────────────────────┐  │
│ │ Key:           │ Value:                                   │  │
│ │ GITHUB_TOKEN   │ ••••••••••••••••                        │  │
│ │ + Add Variable                                             │  │
│ └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│ Description (optional):                                        │
│ ┌───────────────────────────────────────────────────────────┐  │
│ │ Access local files for reading and writing               │  │
│ └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│                         [Cancel]  [Save Server]               │
└─────────────────────────────────────────────────────────────────┘
```

### Configuration Fields

| Field | Required | Description |
|-------|----------|-------------|
| **Name** | Yes | Unique identifier for this server |
| **Command** | Yes | Command to run (e.g., `npx`, `node`) |
| **Arguments** | Yes | Arguments for the command |
| **Working Directory** | No | Directory to run the command in |
| **Environment Variables** | No | API keys, tokens, etc. |
| **Description** | No | Human-readable description |

### Common Configurations

#### Filesystem Server

```
Command: npx
Arguments: -y @modelcontextprotocol/server-filesystem /path/to/allowed/directory
```

#### GitHub Server

```
Command: npx
Arguments: -y @modelcontextprotocol/server-github
Environment: GITHUB_TOKEN=your_token_here
```

#### Brave Search Server

```
Command: npx
Arguments: -y @modelcontextprotocol/server-brave-search
Environment: BRAVE_API_KEY=your_api_key_here
```

## Managing Servers

### Editing a Server

1. Click **Edit** on the server card
2. Modify the configuration
3. Click **Save Server**

### Removing a Server

1. Click **Remove** on the server card
2. Confirm in the dialog
3. Server is deleted

### Server Status

| Status | Icon | Meaning |
|--------|------|---------|
| **Connected** | Green dot | Server is running, tools available |
| **Disconnected** | Gray dot | Server not connected |
| **Error** | Red dot | Connection failed |
| **Loading** | Spinner | Checking status |

### Testing Connection

1. Click **Test** on a server card
2. System verifies the server is accessible
3. Result shown in toast notification

## Using MCP Tools

Once configured, MCP tools are automatically available to the Pi agent. The agent decides when to use them based on your prompts.

### Example Interactions

#### GitHub Integration

```
You: "Create an issue in my repo asking for feedback on the login flow"

Agent uses: github_create_issue
  └─ Title: "Feedback needed: Login flow redesign"
  └─ Body: "Looking for feedback on the new login flow..."
```

#### Web Search

```
You: "Search the web for best practices on React state management"

Agent uses: brave_search
  └─ Query: "React state management best practices 2024"
  └─ Returns: Top search results with summaries
```

#### File Operations

```
You: "Read the README and tell me what this project does"

Agent uses: read_file
  └─ Path: /path/to/README.md
  └─ Returns: File contents
```

## Per-Workspace Configuration

### Workspace-Specific Servers

MCP servers can be configured per workspace:

1. Open a workspace
2. Click **MCP** in the title bar
3. Configure servers for this workspace only

### Default Configuration

When no workspace is specified, servers are available globally across all workspaces.

## Troubleshooting

### "Server Not Responding"

1. Check the command is correct
2. Verify the package is installed: `npx -y @modelcontextprotocol/server-filesystem`
3. Check environment variables are set
4. Try restarting the server

### "Permission Denied"

1. Check file permissions for executable
2. Verify working directory is accessible
3. Check environment variables are properly formatted

### "Tools Not Appearing"

1. Refresh the page
2. Check server status shows "Connected"
3. Verify the MCP server supports the expected tools
4. Check the console for errors

### "API Key Invalid"

1. Verify the API key is correct
2. Check the key has necessary permissions
3. Ensure the key is in the correct environment variable

## Security Considerations

### API Keys

- Store API keys in environment variables, not in config files
- Use keys with minimal required permissions
- Rotate keys regularly

### File Access

- Filesystem MCP server should be limited to specific directories
- Avoid giving broad access to system files

### Network Access

- Some servers make network requests
- Be aware of data sent to external services

## Related

- [Settings](settings.md) — General settings
- [Chat Interface](chat.md) — How the agent uses tools
- [API Reference](../api.md) — MCP API endpoints