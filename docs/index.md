# lamda Documentation

Welcome to **lamda**, a local-first desktop coding workspace for running Pi coding agent sessions against real repositories.

## 📚 Documentation Guide

| Category | Document | Description |
|----------|----------|-------------|
| **Getting Started** | | |
| Quick Start | [Quick Start Guide](quick-start.md) | Get up and running in 5 minutes |
| Installation | [Getting Started](getting-started.md) | Detailed installation and setup |
| **Features** | | |
| Workspaces | [Workspaces Guide](features/workspaces.md) | Managing projects and threads |
| Chat | [Chat Guide](features/chat.md) | Communicating with the AI agent |
| Git | [Git Guide](features/git.md) | Version control workflow |
| Terminal | [Terminal Guide](features/terminal.md) | Embedded shell access |
| Tasks | [Tasks Guide](features/tasks.md) | Workspace shell command shortcuts |
| Settings | [Settings Guide](features/settings.md) | Configuration and preferences |
| Themes | [Themes Guide](features/themes.md) | Color themes and fonts |
| MCP | [MCP Guide](features/mcp.md) | Model Context Protocol servers |
| **Reference** | | |
| API | [API Reference](api.md) | Server REST API endpoints |
| Providers | [Providers](providers.md) | AI provider configuration |
| CLI | [CLI Reference](cli.md) | Command-line commands |
| Architecture | [Architecture](architecture.md) | Technical architecture overview |
| **Contributing** | | |
| Contributing | [Contributing Guide](contributing.md) | How to contribute to the project |

---

## 🎯 Key Features

| Feature | Description |
|---------|-------------|
| **Chat Interface** | Real-time streaming conversations with the Pi coding agent |
| **Thread Modes** | Agent, Ask, and Plan modes control agent behaviour per thread |
| **Thread Forking** | Branch any conversation at any earlier message |
| **Git Integration** | View diffs, hunk-level staging, commit, branches, stashes, and revert |
| **Review Panel** | Side-by-side diff viewer with last-turn file change tracking |
| **Embedded Terminal** | Multi-tab terminal with WebSocket PTY backend |
| **File Tabs** | Open source files in tabs alongside chat threads |
| **Command Palette** | Keyboard-driven command and file search (`Cmd/Ctrl + K`) |
| **Workspaces** | Organize multiple repositories with multiple conversation threads |
| **Workspace Tasks** | One-click shell command shortcuts per workspace |
| **LSP Integration** | Live diagnostics in the file viewer, with one-click language server installs |
| **MCP Support** | Connect to Model Context Protocol servers for extended capabilities |
| **Themes & Fonts** | Built-in color themes (Catppuccin, Nord, Tokyo Night, …), custom themes, and Google Fonts |
| **Usage Tracking** | AI token and cost stats with date-range filtering |
| **Local Models** | Manage local inference providers alongside cloud APIs |
| **Local-First** | All data stored locally in SQLite (`~/.lamda-code/db-v2.sqlite`) |
| **Multiple Providers** | Support for Anthropic, OpenAI, DeepSeek, Google Gemini, and more |

---

## 🚀 Quick Reference

```sh
# Install dependencies
npm install

# Start all apps (web, server, desktop)
npm run dev

# Build for production
npm run build

# Type check
npm run check-types
```

---

## 🖥️ Application Overview

When you launch lamda, you'll see:

```
┌─────────────────────────────────────────────────────────────────────┐
│ [≡] lamda | Thread: Fix login bug  |  [Open With ▾] [MCP] [Commit] │ <- Title Bar
├─────────────┬───────────────────────────────────────────┬───────────┤
│             │                                           │           │
│ Workspaces  │          Chat Interface                   │   Diff    │
│             │                                           │   Panel   │
│ ▼ my-project│  ┌─────────────────────────────────┐    │           │
│   ├ Thread 1│  │ Agent: I'll help you fix...     │    │  Git status│
│   └ Thread 2│  │ Tool: read_file("src/auth.ts")   │    │  Files    │
│             │  │ User: The login button isn't... │    │  Branch   │
│ ▼ another  │  └─────────────────────────────────┘    │           │
│             │                                           │           │
├─────────────┴───────────────────────────────────────────┴───────────┤
│ [Terminal ▾] [+Tab]                                            [×] │
│ ┌───────────────────────────────────────────────────────────────┐ │
│ │ $ git status                                                    │ │
│ │ $ █                                                             │ │
│ └───────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 📖 Feature Guides

### [Chat Interface](features/chat.md)

The chat interface is your primary way to interact with the Pi coding agent:

- **Send messages** — Type prompts and get AI responses with real-time streaming
- **Thread modes** — Choose `agent`, `ask`, or `plan` per thread
- **Thread forking** — Branch from any earlier message to explore alternatives
- **Tool execution** — Watch the agent use tools (read files, edit code, run commands)
- **Thinking visibility** — Toggle whether to show the agent's thinking process
- **Context usage** — Monitor token usage and context window

### [Git Integration](features/git.md)

Full git workflow support directly in the app:

- **View changes** — See unstaged, staged, and untracked file changes
- **Stage/unstage** — Selectively stage files or individual diff hunks
- **Commit** — Write commit messages (with conventional commit support)
- **Branches** — Switch branches, create new branches
- **Stashes** — Temporarily store changes, then restore them
- **Revert** — Discard changes to files or restore to an earlier agent turn

### [Terminal](features/terminal.md)

Embedded terminal with full shell access:

- **Multi-tab support** — Multiple terminal sessions
- **WebSocket PTY** — Server-side PTY with client-side rendering
- **Theme support** — Dark and light terminal themes
- **Auto-resize** — Automatically adjusts to panel size

### [Workspaces](features/workspaces.md)

Organize your work by repository:

- **Create workspace** — Open a local folder as a workspace
- **Clone repository** — Clone from git URL
- **Multiple threads** — Multiple conversation threads per workspace
- **Archive threads** — Keep threads for reference without cluttering
- **Pin threads and workspaces** — Pin important items to the top
- **Fork threads** — Branch a conversation at any earlier message

### [Tasks](features/tasks.md)

User-defined shell command shortcuts per workspace:

- **One-click execution** — Run common commands without typing
- **Custom icons** — Emoji icons for quick visual recognition
- **Per-workspace** — Each workspace has its own task list

### [Settings](features/settings.md)

Configure your preferences:

- **Provider configuration** — Add API keys for AI providers
- **Model selection** — Choose which model to use
- **Thinking level** — Control how much reasoning the agent does
- **Appearance** — Color themes, fonts, and corner radius (see the [Themes Guide](features/themes.md))
- **Retry configuration** — Adjust error handling behavior

### [MCP Servers](features/mcp.md)

Extend the agent's capabilities:

- **Filesystem** — Access local files
- **GitHub** — GitHub API integration
- **Brave Search** — Web search capabilities
- **And more** — Any MCP-compliant server

---

## 🔧 Troubleshooting

### Common Issues

**Application won't start**
```sh
# Check Node.js version (requires 18+)
node --version

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

**API key not working**
- Verify your API key is valid
- Check that the provider is correctly configured in Settings
- Ensure no firewall is blocking requests

**Terminal not connecting**
- The server must be running for terminal WebSocket connection
- Check that port 3001 is not in use by another application

**Git operations failing**
- Ensure Git is installed (`git --version`)
- Verify the workspace path is correct
- Check that you have proper file permissions

---

## 📊 Project Status

> **Status**: Early open-source release. Functional but evolving. Current version: **v0.18.0**

- ✅ Chat with real-time streaming via WebSocket
- ✅ Thread modes: agent, ask, plan
- ✅ Thread forking with git state restoration
- ✅ Git workflow (status, diff, hunk staging, commit, branches, stashes, revert, workspace-level history)
- ✅ Embedded terminal with persistent multi-tab sessions and auto-reconnect
- ✅ Workspace/thread management with pinning and archiving
- ✅ Workspace tasks (custom shell command shortcuts)
- ✅ File tabs, file tree browser, and Monaco code/diff viewers
- ✅ Command palette (`Cmd/Ctrl + K`)
- ✅ LSP diagnostics with one-click language server installation
- ✅ MCP server integration
- ✅ Theming engine with built-in and custom themes, Google Fonts support
- ✅ AI usage tracking (tokens and cost, with date-range filtering)
- ✅ Local model provider management
- ✅ Token-based authentication for the server API and WebSockets
- ✅ Multiple AI providers (20+)
- ⚠️ No automated test suite yet
- ⚠️ macOS `arm64` packaging only (for now)

---

## 🆘 Getting Help

- [GitHub Issues](https://github.com/sdawn29/lambda/issues) — Report bugs and request features
- [AGENTS.md](../AGENTS.md) — Context for AI coding agents working on this codebase
