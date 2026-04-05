# AGENTS.md — desktop

> Auto-generated context for coding agents. Last updated: 2026-04-05

## Purpose

Electron shell that wraps the web app and manages the embedded Hono server process, providing native capabilities like folder selection and IPC communication.

## Quick Reference

| Action    | Command                                           |
| --------- | ------------------------------------------------- |
| Dev       | `npm run dev -w desktop`                          |
| Start     | `npm run start -w desktop`                        |
| Build     | `npm run build -w desktop` (builds web app first) |
| Lint      | `npm run lint -w desktop`                         |
| Typecheck | `npm run check-types -w desktop`                  |

## Architecture

Electron main process (`src/main.ts`) that:

1. Spawns the Hono server as a child process and waits for it to signal readiness via JSON on stdout
2. Loads the web UI from Vite dev server (dev) or bundled `dist/index.html` (prod)
3. Exposes native APIs via preload script (`src/preload.ts`)
4. Kills the server process on app quit

### Key Files

- `bootstrap.mjs` — Entry point that uses `tsx` to run TypeScript source directly during development
- `src/main.ts` — Electron main process: window creation, server spawning, IPC handlers
- `src/preload.ts` — Context bridge exposing `electronAPI` to the renderer

## IPC API

| Channel           | Direction       | Description                                             |
| ----------------- | --------------- | ------------------------------------------------------- |
| `select-folder`   | renderer → main | Opens native folder picker dialog, returns path or null |
| `get-server-port` | renderer → main | Returns the dynamically assigned server port            |

The `electronAPI` is exposed on `window.electronAPI` with methods:

- `window.electronAPI.platform` — Current OS platform string
- `window.electronAPI.selectFolder()` — Promise<string | null>
- `window.electronAPI.getServerPort()` — Promise<number>

## Conventions

- **No test framework** — tests not configured
- **TypeScript compiled at runtime** via `tsx` in dev, no build step for Electron source
- **Preload script** is compiled via `esbuild` at runtime (not bundled ahead of time)
- **Server port is dynamic** — server is spawned with `PORT=0`, port is read from ready JSON message

## Dependencies

- `electron` (v41) — Desktop shell
- `tsx` — TypeScript execution in development
- `esbuild` — Runtime compilation of preload script
- `@asphalt/server` — Dependency reference to the Hono server package

## Gotchas

- The server is spawned with `PORT=0` (random available port) — the web app must discover the port via `window.electronAPI.getServerPort()` rather than using a hardcoded value
- `bootstrap.mjs` is the entry point in `package.json` `"main"` — this file uses `tsx/esm/api` to load `src/main.ts`
- In production, the server is loaded from `process.resourcesPath/server/server.cjs` — this must be bundled during the build/packaging step
- The preload script is written to a temp file at runtime (`/tmp/asphalt-preload.js`) — this is a deliberate choice to avoid a build step
- `titleBarStyle: "hiddenInset"` means the web app must implement its own title bar (see `web/src/components/title-bar.tsx`)
- Server has a 15-second startup timeout — if it doesn't signal ready, the app fails

## Related

- [apps/web](../web/AGENTS.md) — Web UI loaded inside the Electron window
- [apps/server](../server/AGENTS.md) — Hono server spawned as child process
