# AGENTS.md — web/src/features/electron

> Auto-generated context for coding agents. Last updated: 2026-04-28

## Purpose

Electron feature module — provides Electron-specific integration including server lifecycle management, auto-updates, file system operations, and desktop-specific functionality. Falls back gracefully in browser environments.

## Overview

The electron module (5 files) provides:

1. **Server status monitoring** — track server readiness, port assignment, errors
2. **Auto-updates** — check, download, install Electron updates
3. **File system access** — folder selection, path opening, app launching
4. **Platform detection** — detect OS (macOS, Windows, Linux)
5. **Fullscreen state** — track and subscribe to window fullscreen changes

## Architecture

```
┌─ API Layer (api.ts)
│  ├─ Server lifecycle — getServerStatus, restartServer
│  ├─ File operations — selectFolder, openPath, openExternal
│  ├─ App launching — openWorkspaceWithApp, openFileWithApp, listOpenWithApps
│  ├─ Updates — checkForUpdates, downloadUpdate, installUpdate
│  └─ Window — getFullscreen, subscribeToFullscreen
│
├─ Queries (queries.ts)
│  ├─ Server status query with WebSocket subscription
│  ├─ Platform query
│  ├─ Update status query with subscription
│  └─ Open-with apps queries
│
├─ Mutations (mutations.ts)
│  └─ Wrappers for all mutation operations
│
└─ Components
   └─ ServerUnavailable.tsx — Fallback UI when server unreachable
```

## Key Files

### API (api.ts)

**Server Lifecycle:**

- `getElectronPlatform()` — Returns "darwin" | "win32" | "linux" or null (browser)
- `getServerPort()` — Get assigned server port (null if not running)
- `getServerStatus()` — Get full server status object
- `subscribeToServerStatus(callback)` — Subscribe to server status changes
- `restartServer()` — Restart the Hono server

**File Operations:**

- `selectFolder(options?)` — Open folder picker dialog
- `openPath(path)` — Open file in default app
- `openExternal(url)` — Open URL in browser
- `openWorkspaceWithApp(workspacePath, appId?)` — Open folder with specific app
- `openFileWithApp(filePath, appId?)` — Open file with specific app
- `listOpenWithApps()` — List apps that can open given file types
- `getOpenWithAppIcon(appId)` — Get icon for app

**Update Management:**

- `getUpdateStatus()` — Get current update phase
- `subscribeToUpdateStatus(callback)` — Subscribe to update status changes
- `checkForUpdates()` — Check for new version
- `downloadUpdate()` — Download available update
- `installUpdate()` — Install and restart

**Window State:**

- `getFullscreen()` — Get current fullscreen state
- `subscribeToFullscreen(callback)` — Subscribe to fullscreen changes

### Queries (queries.ts)

| Hook                      | Type  | Description                           |
| ------------------------- | ----- | ------------------------------------- |
| `useElectronPlatform`     | Query | Platform detection (cached forever)   |
| `useElectronServerPort`   | Query | Server port                           |
| `useElectronServerStatus` | Query | Server status with subscription       |
| `useElectronFullscreen`   | Query | Fullscreen state with subscription    |
| `useOpenWithApps`         | Query | List of "open with" apps              |
| `useOpenWithAppIcons`     | Query | Icon data for apps (parallel queries) |
| `useElectronUpdateStatus` | Query | Update status with subscription       |

**Subscriptions pattern:**

```typescript
useEffect(() => {
  return subscribeToServerStatus((status) => {
    queryClient.setQueryData(electronKeys.serverStatus, status)
  })
}, [queryClient])
```

### Mutations (mutations.ts)

| Hook                      | Operation                 |
| ------------------------- | ------------------------- |
| `useSelectFolder`         | Open folder picker        |
| `useOpenPath`             | Open file                 |
| `useOpenWorkspaceWithApp` | Launch app with workspace |
| `useOpenExternal`         | Open URL                  |
| `useCheckForUpdates`      | Trigger update check      |
| `useDownloadUpdate`       | Download update           |
| `useInstallUpdate`        | Install and restart       |

### Components

- **`ServerUnavailable`** — Fallback UI component
  - Shown when server is unreachable
  - Provides retry/restart options

## Browser Fallback

When running in browser (not Electron), these functions return safe defaults:

| Function                | Browser Fallback                               |
| ----------------------- | ---------------------------------------------- |
| `getElectronPlatform()` | `null`                                         |
| `getServerPort()`       | `null`                                         |
| `getServerStatus()`     | `{ status: "ready", port: null, error: null }` |
| `selectFolder()`        | `null`                                         |
| All subscriptions       | `() => {}` (no-op)                             |

## TypeScript Types

```typescript
type ServerStatus = {
  status: "starting" | "ready" | "error"
  port: number | null
  error: string | null
}

type UpdateStatus = {
  phase: "idle" | "checking" | "downloading" | "downloaded"
  progress?: number
}

type OpenWithApp = {
  id: string
  name: string
  // ... platform-specific fields
}
```

## Conventions

- **Graceful degradation** — All functions check `window.electronAPI` existence
- **Subscription cleanup** — All `subscribeTo*` functions return unsubscribe function
- **Infinite stale time** — Query data is cached forever (electron state doesn't change often)
- **Parallel icon queries** — `useOpenWithAppIcons` uses `useQueries` for parallel fetching
- **Server unreachable** — When `getServerUrl()` fails, throws `ServerUnreachableError`

## Dependencies

- `@tanstack/react-query` — State management
- `@/shared/lib/client` — `ServerUnreachableError`, `apiFetch`

## Gotchas

- **`window.electronAPI` type** — Defined in `electron.d.ts`, may not exist in browser
- **Port null in browser** — Browser uses `VITE_SERVER_URL` env var instead
- **Update only works in Electron** — Browser has no auto-update mechanism
- **No clipboard in web** — Electron-specific file operations unavailable in browser
- **Subscription memory leaks** — Ensure subscriptions are unsubscribed on unmount

## Related

- [apps/web/src/shared/AGENTS.md](../../shared/AGENTS.md) — Shared utilities
- [apps/desktop/AGENTS.md](../../../../apps/desktop/AGENTS.md) — Electron main process
- [apps/server/AGENTS.md](../../../../apps/server/AGENTS.md) — Server that electron controls
