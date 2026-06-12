# Contributing

Thank you for your interest in contributing to lamda!

## Getting Started

### Prerequisites

- Node.js 18+
- npm 11+
- Git

### Setup

```sh
git clone https://github.com/sdawn29/lambda.git
cd lambda
npm install
```

### Running Development

```sh
# Start all apps (web, server, desktop)
npm run dev

# Or start individual apps
npm run dev -w web              # Web UI only
npm run dev -w @lamda/server     # Server only
npm run dev -w desktop           # Desktop app
```

## Before Submitting a PR

Run these checks to ensure your changes are compatible:

```sh
npm run build          # Build all apps
npm run check-types    # TypeScript type checking
npm run lint          # Lint checks
```

## Project Structure

```
lamda/
├── apps/
│   ├── desktop/       # Electron shell
│   ├── server/        # Hono API server
│   └── web/           # React UI
├── packages/
│   ├── db/            # Drizzle ORM + SQLite
│   ├── git/           # Git CLI wrappers
│   ├── lsp/           # Language Server Protocol integration
│   ├── mcp/           # MCP client management
│   ├── pi-sdk/        # Pi agent SDK wrapper
│   └── subagent/      # Subagent utilities
├── docs/              # Documentation
└── AGENTS.md          # AI agent context
```

## Architecture Notes

- **Monorepo** with npm workspaces
- **Turborepo** for build orchestration
- **TypeScript strict mode** everywhere
- **ESM** in web and packages, **CJS** in server

## Adding Features

### New API Routes

1. Create route file in `apps/server/src/routes/`
2. Register in `apps/server/src/app.ts`
3. Add endpoint documentation to `docs/api.md`
4. Update `apps/server/src/routes/AGENTS.md`

### New UI Components

1. Add to appropriate feature module in `apps/web/src/features/`
2. Follow existing patterns (TanStack Query for server state, Zustand for UI state)
3. Use shared components from `apps/web/src/shared/ui/`

### New Packages

1. Create in `packages/<name>/`
2. Add to workspace in `package.json`
3. Update root `AGENTS.md` with new package reference

## Testing

> **Note**: This project currently has no automated test suite.

Manual verification is expected. When adding features:
- Document testing steps in PR description
- Note any manual verification needed

## Documentation

- User-facing docs go in `docs/`
- AI agent context goes in `AGENTS.md`
- Update both when adding significant features

## Release Process

Releases are cut locally with `scripts/release.mjs`, which analyzes conventional commits since the last tag:

1. Push commits with conventional format (`feat:`, `fix:`, etc.) to `main`
2. Run `npm run release:dry-run` to preview the version bump and changelog
3. Run `npm run release` — bumps the version, updates `CHANGELOG.md`, syncs all workspace package versions, commits, tags, and pushes

Pass `--patch`, `--minor`, or `--major` to force a specific bump instead of auto-detecting from commits.

## Code Style

- Use Prettier for formatting (`npm run format`)
- Follow existing patterns in each module
- Keep files focused and small
- Document non-obvious behavior

## Getting Help

- [docs/index.md](index.md) — Full documentation
- [AGENTS.md](../AGENTS.md) — AI agent context
- [GitHub Issues](https://github.com/sdawn29/lambda/issues) — Bug reports and questions