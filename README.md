# lamda

A local-first desktop workspace for AI-powered coding sessions.

![Version](https://img.shields.io/badge/version-0.4.0-blue) ![Platform](https://img.shields.io/badge/platform-macOS-lightgrey) ![License](https://img.shields.io/badge/license-ISC-green)

## Features

- **Chat** — talk to the Pi coding agent about your code
- **Git** — view diffs, stage, commit, and switch branches
- **Terminal** — embedded shell with multi-tab support
- **Workspaces** — organize multiple repos and conversation threads

## Getting Started

**Requirements:** Node.js 18+, npm 11+

```sh
git clone https://github.com/your-username/lambda.git
cd lambda
npm install
npm run dev
```

This starts all apps (desktop, server, web) concurrently via Turborepo.

## Tech Stack

| Layer    | Technology                       |
|----------|----------------------------------|
| Desktop  | Electron                         |
| UI       | React 19 + Vite + TanStack Router|
| Server   | Hono (Node.js)                   |
| Database | Drizzle ORM + SQLite             |
| Agent    | Pi Coding Agent                  |

## Project Structure

```
apps/
  desktop/   # Electron app
  server/    # Hono API server
  web/       # React frontend
packages/
  db/        # Drizzle schema & migrations
  git/       # Git integration
  lsp/       # Language server protocol
  mcp/       # MCP server
```

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start all apps |
| `npm run build` | Build everything |
| `npm run check-types` | TypeScript type checks |
| `npm run lint` | Lint all packages |

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |
| `VITE_SERVER_URL` | `http://localhost:3001` | Server URL for the web UI |

## Status

Early release — functional but evolving. No automated tests yet. macOS `arm64` only.

## Contributing

1. Fork the repo and create a branch
2. Make your changes
3. Run checks: `npm run build && npm run check-types && npm run lint`
4. Open a pull request

## Docs

- [Getting Started](docs/getting-started.md)
- [Architecture](docs/architecture.md)
- [API Reference](docs/api.md)
- [AGENTS.md](AGENTS.md) — context for AI coding agents
