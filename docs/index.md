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
| Settings | [Settings Guide](features/settings.md) | Configuration and preferences |
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
| **Git Integration** | View diffs, stage files, commit changes, manage branches and stashes |
| **Embedded Terminal** | Multi-tab terminal with WebSocket PTY backend |
| **Workspaces** | Organize multiple repositories with multiple conversation threads |
| **MCP Support** | Connect to Model Context Protocol servers for extended capabilities |
| **Local-First** | All data stored locally in SQLite |
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
- **Tool execution** — Watch the agent use tools (read files, edit code, run commands)
- **Thinking visibility** — Toggle whether to show the agent's thinking process
- **Slash commands** — Use `/search`, `/file`, `/terminal` for quick actions
- **Context usage** — Monitor token usage and context window

### [Git Integration](features/git.md)

Full git workflow support directly in the app:

- **View changes** — See unstaged, staged, and untracked file changes
- **Stage/unstage** — Selectively stage files for commit
- **Commit** — Write commit messages (with conventional commit support)
- **Branches** — Switch branches, create new branches
- **Stashes** — Temporarily store changes, then restore them
- **Revert** — Discard changes to files

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
- **Pin threads** — Pin important threads to the top

### [Settings](features/settings.md)

Configure your preferences:

- **Provider configuration** — Add API keys for AI providers
- **Model selection** — Choose which model to use
- **Thinking level** — Control how much reasoning the agent does
- **Theme** — Dark/light mode
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

> **Status**: Early open-source release. Functional but evolving.

- ✅ Chat with streaming responses
- ✅ Git workflow (status, diff, staging, commit, branches, stashes)
- ✅ Embedded terminal
- ✅ Workspace/thread management
- ✅ MCP server integration
- ✅ Multiple AI providers
- ⚠️ No automated test suite yet
- ⚠️ macOS `arm64` packaging only (for now)

---

## 🆘 Getting Help

- [GitHub Issues](https://github.com/snehasishdawn/lamda/issues) — Report bugs and request features
- [AGENTS.md](../AGENTS.md) — Context for AI coding agents working on this codebase