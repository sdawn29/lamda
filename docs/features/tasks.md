# Workspace Tasks

Tasks are saved shell-command shortcuts for a workspace. They are useful for commands you run often, such as tests, builds, linters, type checks, or dev servers.

> Screenshot needed: capture `/workspace/<threadId>` with the tasks dropdown open and several saved tasks visible.

## Add a Task

1. Open a workspace.
2. Open the tasks dropdown from the title bar or workspace controls.
3. Click `Add Task`.
4. Enter a command.
5. Choose an icon if available.
6. Save.

## Run a Task

1. Open the tasks dropdown.
2. Click the run button for a task.
3. lamda opens a terminal tab and runs the command in the workspace root.
4. Watch output in the terminal panel.

## Edit a Task

1. Open the tasks dropdown.
2. Open the task menu.
3. Choose `Edit`.
4. Update the command or icon.
5. Save.

## Delete a Task

1. Open the task menu.
2. Choose `Delete`.
3. Confirm deletion.

Deleting a task does not affect terminal history or files in the workspace.

## Good Task Examples

| Task       | Command               |
| ---------- | --------------------- |
| Dev server | `npm run dev`         |
| Build      | `npm run build`       |
| Type check | `npm run check-types` |
| Lint       | `npm run lint`        |
| Tests      | `npm test`            |
| Install    | `npm install`         |

## Storage

Tasks are stored per workspace in the local SQLite database. They are not committed to the project repository unless you separately document them in project files.
