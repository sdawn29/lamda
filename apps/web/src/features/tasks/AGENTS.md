# AGENTS.md — web/src/features/tasks

> Auto-generated context for coding agents. Last updated: 2026-05-16

## Purpose

Manages custom workspace tasks — user-defined shell commands that can be run from within a workspace. Tasks are persisted per-workspace using Zustand with localStorage.

## Quick Reference

| Action | File | Description |
|--------|------|-------------|
| Task state | `store.ts` | `useTasksStore` — CRUD operations per workspace |
| Types | `types.ts` | `WorkspaceTask` interface |
| Dialog UI | `components/tasks-dialog.tsx` | Modal for managing tasks |

## Public API

```typescript
// types.ts
export interface WorkspaceTask {
  id: string
  name: string
  command: string
  description?: string
}

// store.ts exports
export function useTasksStore() // Zustand store with persist middleware
```

## State Shape

```typescript
interface TasksStore {
  tasksByWorkspace: Record<string, WorkspaceTask[]>
  getTasks: (workspaceId: string) => WorkspaceTask[]
  addTask: (workspaceId: string, task: Omit<WorkspaceTask, "id">) => void
  updateTask: (workspaceId: string, id: string, updates: Partial<Omit<WorkspaceTask, "id">>) => void
  deleteTask: (workspaceId: string, id: string) => void
}
```

## Persistence

- Uses Zustand `persist` middleware with `localStorage`
- Storage key: `lamda-workspace-tasks`
- Task IDs generated via `crypto.randomUUID()`

## Usage Pattern

1. Tasks dialog is opened from the command palette or menu
2. User can add/edit/delete tasks for the current workspace
3. Tasks are executed via the terminal feature when triggered
4. Tasks are scoped to workspace — switching workspaces shows that workspace's tasks

## Related

- [apps/web/src/features/terminal](./terminal/AGENTS.md) — Tasks are executed in the terminal
- [apps/web/src/features/workspace](./workspace/AGENTS.md) — Tasks are scoped to workspace
- [apps/web/src/features/command-palette](./command-palette/AGENTS.md) — Tasks can be triggered from command palette