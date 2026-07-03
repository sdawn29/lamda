# AGENTS.md — web/src/features/workspace

> Auto-generated context for coding agents. Last updated: 2026-04-28

## Purpose

Workspace feature module — manages workspace/thread lifecycle, sidebar navigation, repository cloning, and workspace persistence. Provides the primary navigation structure for the lamda application.

## Overview

The workspace module is a core application feature (9 files, ~1200 lines) that manages:

1. **Workspace CRUD** — create, delete, list workspaces
2. **Thread management** — create, delete, archive, pin threads within workspaces
3. **Repository cloning** — git clone integration with workspace creation
4. **Navigation** — sidebar with workspace/thread hierarchy, empty states

## Architecture

```
┌─ WorkspaceProvider (main exported context)
│  └─ Manages all workspace state + mutations
│
├─ Components
│  ├─ AppSidebar.tsx — Main sidebar navigation
│  ├─ CreateWorkspaceDialog.tsx — New workspace form
│  ├─ WorkspaceEmptyState.tsx — Empty state when no workspaces
│  └─ ArchivedThreadsDialog.tsx — View/restore archived threads
│
├─ Data Layer
│  ├─ context.tsx — WorkspaceProvider + useWorkspace + useCreateWorkspaceAction
│  ├─ queries.ts — useWorkspaces (TanStack Query)
│  ├─ mutations.ts — All workspace/thread mutations
│  └─ api.ts — REST client functions
│
└─ Exports
   └─ index.ts — Barrel: WorkspaceProvider, useWorkspace, useWorkspaces, components
```

## Key Files

### Context (context.tsx)

- **`WorkspaceProvider`** — Main React context for workspace state
  - State: `workspaces[]`, `isLoading`
  - Operations: `createWorkspace`, `cloneRepository`, `deleteWorkspace`, `createThread`, `deleteThread`, `archiveThread`, `pinThread`, `unpinThread`, `setThreadTitle`, `resetAll`

- **`useWorkspace()`** — Consumer hook
  - Returns: `WorkspaceContextValue` with all operations
  - Throws if used outside `WorkspaceProvider`

- **`useCreateWorkspaceAction()`** — Navigation-aware hook
  - Combines workspace creation with TanStack Router navigation
  - Auto-navigates to first thread after workspace creation

### API (api.ts)

- **Workspace operations:**
  - `listWorkspaces()` — GET `/workspaces`
  - `createWorkspace(body)` — POST `/workspace` (returns 409 if exists)
  - `deleteWorkspace(id)` — DELETE `/workspace/:id`
  - `updateWorkspaceOpenWithApp(id, appId)` — PATCH `/workspace/:id/open-with-app`

- **Thread operations:**
  - `createThread(workspaceId)` — POST `/workspace/:id/thread`
  - `deleteThread(threadId)` — DELETE `/thread/:id`
  - `updateThreadTitle(threadId, title)` — PATCH `/thread/:id/title`
  - `updateThreadModel(threadId, modelId)` — PATCH `/thread/:id/model`
  - `updateThreadStopped(threadId, stopped)` — PATCH `/thread/:id/stopped`
  - `updateThreadLastAccessed(threadId)` — PATCH `/thread/:id/last-accessed`
  - `archiveThread(threadId)` — PATCH `/thread/:id/archive`
  - `unarchiveThread(threadId)` — PATCH `/thread/:id/unarchive`
  - `pinThread(threadId)` — PATCH `/thread/:id/pin`
  - `unpinThread(threadId)` — PATCH `/thread/:id/unpin`

- **Utility operations:**
  - `listArchivedThreads()` — GET `/threads/archived`
  - `resetAllData()` — DELETE `/reset` (dangerous!)
  - `listWorkspaceIndexFiles(workspaceId)` — GET `/workspace/:id/files`
  - `triggerWorkspaceReindex(workspaceId)` — POST `/workspace/:id/reindex`

### Queries (queries.ts)

- **`useWorkspaces()`** — TanStack Query hook
  - Returns: `WorkspaceDto[]`
  - `staleTime: 5 minutes`
  - Auto-refetches on window focus

- **`useWorkspaceIndex(workspaceId)`** — File index for workspace
  - Returns: `WorkspaceFileEntry[]` (path, name, isDirectory)
  - `staleTime: 60 seconds`

### Mutations (mutations.ts)

All mutations update the `workspacesQueryKey` cache optimistically:

| Hook                   | Operation | Cache Update                          |
| ---------------------- | --------- | ------------------------------------- |
| `useCreateWorkspace`   | POST      | `upsertWorkspace`                     |
| `useDeleteWorkspace`   | DELETE    | Filter + remove session queries       |
| `useCloneRepository`   | git clone | Creates workspace after clone         |
| `useCreateThread`      | POST      | Append to workspace threads           |
| `useDeleteThread`      | DELETE    | Filter + remove session queries       |
| `useUpdateThreadTitle` | PATCH     | Optimistic update + rollback on error |
| `useArchiveThread`     | PATCH     | Filter from list, invalidate archived |
| `usePinThread`         | PATCH     | Optimistic update                     |
| `useUnpinThread`       | PATCH     | Optimistic update                     |
| `useResetAll`          | DELETE    | Clear all queries                     |

### Components

- **`AppSidebar.tsx`** — Main navigation sidebar
  - Shows workspace/thread tree
  - Collapsible sections
  - Quick actions (new workspace, settings)

- **`CreateWorkspaceDialog.tsx`** — Modal for new workspace
  - Local folder path input
  - Git URL input (triggers clone)
  - Validation

- **`ArchivedThreadsDialog.tsx`** — Restore archived threads
  - Lists archived threads across all workspaces
  - Unarchive action

- **`WorkspaceEmptyState.tsx`** — Empty state UI
  - Shown when no workspaces exist
  - CTA to create first workspace

## Data Types

```typescript
interface WorkspaceDto {
  id: string
  name: string
  path: string
  openWithAppId: string | null
  createdAt: number
  threads: ThreadDto[]
}

interface ThreadDto {
  id: string
  workspaceId: string
  title: string
  modelId: string | null
  isStopped: boolean
  createdAt: number
  sessionId: string | null
  isPinned?: boolean
}

interface ArchivedThreadDto {
  id: string
  workspaceId: string
  workspaceName: string
  workspacePath: string
  title: string
  modelId: string | null
  createdAt: number
}
```

## Conventions

- **Workspace name derived from path** — `path.split(/[/\\]/).pop()`
- **409 conflict handling** — If workspace exists at path, returns `{ workspace, existing: true }`
- **Optimistic updates** — All mutations update cache immediately; rollback on error
- **Session cleanup** — Deleting workspace/thread removes related chat/git queries
- **Git clone creates workspace** — `useCloneRepository` chains `gitClone` → `createWorkspace`
- **Thread auto-creation** — Creating a workspace automatically creates its first thread

## Dependencies

- `@tanstack/react-query` — State management
- `@tanstack/react-router` — Navigation
- `@/features/git` — `gitClone` integration
- `@/features/chat` — Session lifecycle (chatKeys)

## Gotchas

- **`resetAllData()` is destructive** — Deletes all workspaces, threads, and data
- **409 Conflict** — Creating workspace at existing path returns existing workspace, doesn't error
- **Thread workspaceId** — Stored in thread but mutations also require workspaceId for cache updates
- **No optimistic locking** — Concurrent edits may cause cache inconsistency
- **Empty threads array** — New workspace has at least one thread automatically
- **`isStopped` flag** — Tracks whether thread's agent session is stopped (not thread itself)
- **Archived threads span workspaces** — Listed together in `ArchivedThreadsDialog`

## Related

- [apps/web](../../AGENTS.md) — Parent web app
- [apps/server/src/routes/AGENTS.md](../../../../apps/server/src/routes/AGENTS.md) — `/workspaces`, `/workspace`, `/thread` endpoints
- [features/chat/AGENTS.md](../chat/AGENTS.md) — Session management integration
- [features/git/AGENTS.md](../git/AGENTS.md) — Repository cloning
