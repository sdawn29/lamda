# AGENTS.md — web/src/routes

> Auto-generated context for coding agents. Last updated: 2026-05-17

## Purpose

TanStack Router file-based routing configuration for the lamda web application. Defines root layout, index redirect, workspace thread routes, and settings page.

## Route Files

| File | Route | Description |
|------|-------|-------------|
| `__root.tsx` | `/` | Root layout with global providers, theme, panel layout |
| `index.tsx` | `/` | Landing page — redirects to last active thread or empty state |
| `workspace.$threadId.tsx` | `/workspace/$threadId` | Thread workspace with chat view, git panel, terminal |
| `settings.tsx` | `/settings` | Settings page route (redirects to modal in practice) |

## Root Layout (`__root.tsx`)

```
AppProviders wraps everything
├── ThemeProvider (CSS variables, layout engine)
├── WorkspaceProvider (TanStack Query workspace management)
├── MainLayout (panels: nav, content, diff, terminal)
└── ToastContainer (error/success notifications)
```

## Index Route (`index.tsx`)

1. Checks existing tabs — if open, show empty (stay on current tab)
2. Loads workspaces via `useWorkspace()`
3. Loads app settings via `useAppSettings()`
4. If no workspaces → show `WorkspaceEmptyState`
5. If workspaces exist → find saved `ACTIVE_THREAD_ID` or use first thread
6. Redirect to `/workspace/$threadId`

## Workspace Route (`workspace.$threadId.tsx`)

**Responsibilities:**
- Sets active thread ID on mount (clears on unmount)
- Loads workspace/thread from `useWorkspace()`
- Registers tab via `useMainTabs()`
- Keeps tab title synced with thread title
- Saves `ACTIVE_THREAD_ID` to settings on mount
- Updates `lastAccessedAt` timestamp
- Handles fullscreen diff mode (renders null, keeps effects alive)

**URL parameter:** `$threadId` — must exist in workspace threads

**Loading states:**
- `isLoading` — initial data fetch
- `isFetching` — background refetch
- If thread not found after both settle → redirect to `/`

**Key hooks used:**
- `useWorkspace()` / `useWorkspaces()` — workspace data
- `useDiffPanel()` — diff panel context (set workspace path)
- `useMainTabs()` — tab management
- `useUpdateAppSetting()` — persist active thread
- `useUpdateThreadLastAccessed()` — update timestamp
- `useSetActiveThreadId()` — chat context state

## Conventions

- **File naming:** `$` prefix for dynamic route segments (e.g., `workspace.$threadId.tsx`)
- **Lazy loading:** Heavy components wrapped in `<Suspense>` in parent layout
- **No route guards** — thread validity checked in component, redirects to `/` if invalid
- **Tab state independent** — tabs persist across navigation; route params trigger tab registration

## Related

- [apps/web/AGENTS.md](../../AGENTS.md) — Parent web app
- [features/workspace/AGENTS.md](../workspace/AGENTS.md) — Workspace feature module
- [features/chat/AGENTS.md](../chat/AGENTS.md) — Chat streaming in workspace