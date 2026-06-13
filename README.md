# lamda

A local-first desktop workspace for AI-powered coding sessions. Run [Pi coding agent](https://github.com/badlogic/pi-mono) sessions against real repositories, with git, terminal, and editor tooling built in.

![Version](https://img.shields.io/badge/version-0.18.0-blue) ![Platform](https://img.shields.io/badge/platform-macOS-lightgrey)

## Features

- **Chat** — real-time streaming conversations with the Pi coding agent, with Agent / Ask / Plan modes per thread, inline agent questions, live todo tracking, and thread forking from any earlier message
- **Memory** — persistent agent memories that carry across sessions, scoped per-workspace or to all projects, with pinned core memories, categories, and search; relevant memories are injected into prompts and the agent manages them through a built-in `memory` tool
- **Self-healing** — automatically re-prompt the agent to diagnose and fix a turn that ends in an error, with lessons from successful recoveries saved as workspace memories (errors the agent can't fix, like rate limits or auth, are left for you)
- **Git** — view diffs, hunk-level staging, commit, branches, stashes, and a side-by-side review panel with last-turn file change tracking
- **Terminal** — embedded multi-tab shell with persistent PTY sessions, auto-reconnect, and clickable links
- **Workspaces** — organize multiple repos and conversation threads, with workspace-level task shortcuts
- **MCP** — connect Model Context Protocol servers to extend agent capabilities
- **LSP** — language server integration with one-click installs
- **Themes** — built-in color themes (including Catppuccin variants) with Google Fonts integration
- **Command palette** — Cmd+K access to commands and navigation
- **Settings** — configure the agent model, chat behavior, providers, and memory from an in-app settings panel
- **Usage tracking** — AI token usage stats with date-range filtering and context breakdowns

## Getting Started

**Requirements:** Node.js 18+, npm 11+, Git

```sh
git clone https://github.com/sdawn29/lambda.git
cd lambda
npm install
npm run dev
```

This starts all apps (desktop, server, web) concurrently via Turborepo. To run a single app:

```sh
npm run dev -w web              # Web UI only
npm run dev -w @lamda/server    # Server only
npm run dev -w desktop          # Desktop app
```

See the [Quick Start Guide](docs/quick-start.md) for a 5-minute walkthrough, or [Getting Started](docs/getting-started.md) for detailed setup.

## Tech Stack

| Layer    | Technology                                              |
|----------|---------------------------------------------------------|
| Desktop  | Electron 41                                             |
| UI       | React 19 + Vite + TanStack Router + Tailwind CSS 4      |
| Server   | Hono (Node.js)                                          |
| Database | Drizzle ORM + SQLite (better-sqlite3)                   |
| Agent    | [@mariozechner/pi-coding-agent](https://github.com/badlogic/pi-mono) |

## Project Structure

```
apps/
  desktop/   # Electron shell wrapping the web app
  server/    # Hono API server for agent sessions (port 3001)
  web/       # React frontend
packages/
  db/        # Drizzle schema & migrations
  git/       # Git CLI wrappers
  lsp/       # Language server protocol integration
  mcp/       # MCP client integration
  pi-sdk/    # Wrapper around the Pi coding agent
  subagent/  # Subagent orchestration (planned)
```

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start all apps |
| `npm run build` | Build everything |
| `npm run check-types` | TypeScript type checks |
| `npm run lint` | Lint all packages |
| `npm run format` | Format with Prettier |

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |
| `VITE_SERVER_URL` | `http://localhost:3001` | Server URL for the web UI |

See [Providers](docs/providers.md) for AI provider and API key configuration.

## Status

Early release — functional but evolving. No automated tests yet. macOS `arm64` only.

## Contributing

Contributions are welcome! See the [Contributing Guide](docs/contributing.md) for setup, conventions, and workflow. In short:

1. Fork the repo and create a branch
2. Make your changes
3. Run checks: `npm run build && npm run check-types && npm run lint`
4. Open a pull request

## Docs

Full documentation lives in [docs/](docs/index.md):

- [Quick Start](docs/quick-start.md) · [Getting Started](docs/getting-started.md)
- Feature guides: [Workspaces](docs/features/workspaces.md) · [Chat](docs/features/chat.md) · [Git](docs/features/git.md) · [Terminal](docs/features/terminal.md) · [Tasks](docs/features/tasks.md) · [Settings](docs/features/settings.md) · [MCP](docs/features/mcp.md)
- Reference: [API](docs/api.md) · [CLI](docs/cli.md) · [Architecture](docs/architecture.md)
- [AGENTS.md](AGENTS.md) — context for AI coding agents
