# Workspace Tasks

Tasks are user-defined shell command shortcuts attached to a workspace. They provide one-click access to frequently run commands without typing them in the terminal each time.

## Overview

```
┌─────────────────────────────────────────────────────────────────┐
│ Tasks                                                           │
│                                                                 │
│ ┌───────────────────────────────────────────────────────────┐ │
│ │ 🧪  npm test                                    [▶] [✎]  │ │
│ └───────────────────────────────────────────────────────────┘ │
│ ┌───────────────────────────────────────────────────────────┐ │
│ │ 🔨  npm run build                               [▶] [✎]  │ │
│ └───────────────────────────────────────────────────────────┘ │
│ ┌───────────────────────────────────────────────────────────┐ │
│ │ 🚀  npm run dev                                 [▶] [✎]  │ │
│ └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│ [+ Add Task]                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Adding a Task

1. Open the workspace's **Tasks** panel
2. Click **+ Add Task**
3. Fill in the dialog:

| Field | Required | Description |
|-------|----------|-------------|
| **Icon** | No | Emoji shown on the button (e.g., `🧪`) |
| **Command** | Yes | Shell command to run (e.g., `npm test`) |

4. Click **Save**

The task appears immediately in the list.

## Running a Task

Click the **▶** (run) button on any task. The command executes in a new terminal tab that opens in the workspace root directory.

## Editing a Task

Click the **✎** (edit) button on the task card to modify the icon or command. Click **Save** to apply changes.

## Deleting a Task

Open the edit dialog and click **Delete**, or use the context menu.

## Common Examples

| Icon | Command | Purpose |
|------|---------|---------|
| 🧪 | `npm test` | Run test suite |
| 🔨 | `npm run build` | Build project |
| 🚀 | `npm run dev` | Start dev server |
| 🧹 | `npm run lint` | Lint code |
| 🔍 | `npm run check-types` | TypeScript check |
| 📦 | `npm install` | Install dependencies |

## Storage

Tasks are stored per workspace in the SQLite database (`workspace_tasks` table). They persist across restarts and are specific to each workspace.

## API

Tasks can also be managed via the [Tasks API](../api.md#tasks).

## Related

- [Terminal](terminal.md) — Where task commands execute
- [Workspaces](workspaces.md) — Workspace overview
