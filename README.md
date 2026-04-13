# lamda

`lamda` is a local-first desktop coding workspace for running Pi agent sessions against real repositories on your machine. It combines an Electron shell, a React UI, and a local Hono server so you can chat with the agent, inspect git changes, switch branches, and use a terminal without bouncing between separate tools.

> Status: early open-source release. The app is functional, but the surface area is still evolving and there is no automated test suite yet.

## What it does

- Opens local folders as workspaces and lets you create multiple conversation threads per workspace
- Streams Pi agent responses with inline tool execution updates
- Lets you inspect git status, review diffs, stage and unstage files, commit changes, and manage stashes
- Exposes branch switching directly in the chat workflow
- Includes an embedded terminal next to chat and diff views
- Persists workspace metadata, thread history, and messages locally in SQLite

## Why this project exists

Most coding-agent workflows still force you to stitch together several tools: a chat UI, a terminal, git, and your editor. `lamda` tries to close that gap with a focused desktop app built around local repositories and real development workflows.

The goal is not to hide the underlying tools. It is to keep the important ones in one place and make the agent easier to use against an actual codebase.

## Architecture

```text
Electron desktop app
  -> React web UI
  -> Local Hono API server
  -> SQLite persistence via Drizzle
  -> Pi coding agent sessions
```

### Main pieces

- `apps/desktop`: Electron shell that starts the local server process and exposes native APIs such as folder selection
- `apps/web`: React 19 + Vite UI with chat, workspace management, diff panel, and terminal panel
- `apps/server`: Hono server that manages sessions, streaming events, git operations, and thread persistence
- `packages/db`: SQLite + Drizzle persistence layer
- `packages/git`: git CLI helpers for branch and repository operations
- `packages/pi-sdk`: wrapper around `@mariozechner/pi-coding-agent`

## Tech stack

- Electron 41
- React 19
- Vite
- TanStack Router and TanStack React Query
- Tailwind CSS 4
- shadcn/ui on top of Base UI
- Hono
- Drizzle ORM + better-sqlite3
- `@mariozechner/pi-coding-agent`

## Getting started

### Prerequisites

- Node.js 18+
- npm 11+
- Git installed and available on `PATH`
- macOS on Apple Silicon if you want to build the packaged desktop app

### Install dependencies

```sh
npm install
```

### Run the full development stack

```sh
npm run dev
```

This is the simplest way to work on the project. Turborepo runs the workspace development processes in parallel.

### Build everything

```sh
npm run build
```

### Build the packaged desktop app

```sh
npm run build -w desktop
```

This builds the web app, bundles the server, rebuilds Electron native dependencies, and writes macOS `arm64` artifacts to `apps/desktop/release/`.

## Automated releases

GitHub Releases are cut automatically from `main` with `release-please`.

- Push conventional commits to `main`
- `release-please` opens or updates a release PR with the next version and changelog
- Merging that PR creates the GitHub Release and uploads the packaged desktop binaries

The current release scope is intentionally narrow:

- Single repo-wide version shared by the root package and all workspaces
- macOS `arm64` artifacts only
- Unsigned `.dmg` and `.zip` uploads only

While the project stays below `1.0.0`, release versioning is configured so `feat` commits bump the patch version and breaking changes bump the minor version. That keeps the initial automated release on the requested `0.0.1` track from the current `0.0.0` baseline.

The workflow lives in `.github/workflows/release-please.yml` and uses `release-please-config.json` plus `.release-please-manifest.json`.

The workflow uses the default `GITHUB_TOKEN`. If you later need release-generated events to trigger additional workflows, switch the action and upload steps to a dedicated repository secret before adding those downstream automations.

## Useful commands

### Root commands

| Command               | Purpose                                   |
| --------------------- | ----------------------------------------- |
| `npm run dev`         | Start the full development stack          |
| `npm run build`       | Build all apps and packages               |
| `npm run lint`        | Run lint tasks where they are defined     |
| `npm run check-types` | Run TypeScript checks across the monorepo |
| `npm run format`      | Format TypeScript and Markdown files      |

### Workspace commands

| Command                          | Purpose                       |
| -------------------------------- | ----------------------------- |
| `npm run dev -w web`             | Start the web UI only         |
| `npm run build -w web`           | Build the web UI              |
| `npm run typecheck -w web`       | Type-check the web UI         |
| `npm run dev -w @lamda/server`   | Start the server only         |
| `npm run build -w @lamda/server` | Build the server bundle       |
| `npm run start -w @lamda/server` | Run the built server bundle   |
| `npm run dev -w desktop`         | Start Electron in development |
| `npm run check-types -w desktop` | Type-check the desktop app    |

## Configuration

| Variable          | Used by       | Default                 | Notes                                                                                                                   |
| ----------------- | ------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `VITE_SERVER_URL` | `apps/web`    | `http://localhost:3001` | Useful when running the web UI directly in a browser instead of through Electron                                        |
| `PORT`            | `apps/server` | `3001`                  | Standalone server port. The Electron app starts the server on a random local port and passes it to the renderer via IPC |

## Local data

- App data is stored under `~/.lamda-code`
- The SQLite database lives at `~/.lamda-code/db.sqlite`
- Older `~/.lambda-code` data is migrated automatically if it exists
- The repositories you open stay in their existing locations. `lamda` stores metadata and message history, not copies of your projects

## Project structure

```text
.
|- apps/
|  |- desktop/
|  |- server/
|  `- web/
|- packages/
|  |- db/
|  |- git/
|  `- pi-sdk/
|- package.json
`- turbo.json
```

## Contributing

Contributions are welcome.

Before opening a pull request, run the checks that are relevant to your change:

```sh
npm run build
npm run check-types
npm run lint
```

There is no automated test suite yet, so manual verification notes are useful in pull requests.

## Project status

- Packaging is currently wired for macOS `arm64`
- The repository is under active development and internal APIs may still change
- The desktop app is local-first, but model/provider access still depends on your Pi agent configuration

## License

This repository does not currently include a root `LICENSE` file. Add one before publishing the first public open-source release.
