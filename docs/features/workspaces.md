# Workspaces and Threads

Workspaces are local folders or cloned repositories. Threads are conversations inside a workspace. A workspace can contain many threads, and each thread can have its own model, mode, chat history, terminal context, and git review history.

> Screenshot needed: capture `/workspace/<threadId>` with the left sidebar open, at least two workspaces expanded, pinned threads visible, and archived threads accessible.

## Create a Workspace from a Local Folder

1. Click `New Workspace` in the sidebar or run it from the command palette.
2. Choose the local folder option.
3. Browse for a folder in the desktop app, or paste a path in the browser.
4. Confirm creation.
5. lamda creates the workspace and opens its first thread.

## Create a Workspace by Cloning

1. Open `New Workspace`.
2. Choose the clone option.
3. Enter an HTTPS or SSH Git URL.
4. Choose the destination path if prompted.
5. Start the clone.
6. Open the generated workspace when cloning completes.

> Screenshot needed: capture the clone repository tab in the create workspace dialog.

## Create a Thread

1. Hover over a workspace in the sidebar.
2. Click the new-thread action, or run `New Thread` from the command palette.
3. Choose the thread mode and model in the composer.
4. Send the first prompt.

## Rename a Thread

1. Open the thread.
2. Click the title in the sidebar or title bar when editable.
3. Enter a new title.
4. Press `Enter` or leave the field to save.

Thread titles can also be generated from conversation content when chat title generation is enabled.

## Pin and Unpin

Use pinning for work you need to return to often.

1. Open the thread or workspace context menu.
2. Choose `Pin`.
3. Pinned items appear above unpinned items.
4. Use `Unpin` from the same menu to restore normal sorting.

## Archive and Restore Threads

1. Open a thread context menu.
2. Choose `Archive`.
3. Open the archived threads dialog from the sidebar.
4. Select a thread to restore or continue.

Archiving keeps history but removes the thread from the active workspace list.

## Delete a Thread or Workspace

Delete only when you no longer need the local app record.

1. Open the context menu.
2. Choose delete.
3. Confirm the destructive action.

Deleting a workspace removes it from lamda. It does not intentionally delete the repository folder unless a future dialog explicitly says so.

## Workspace Environment

Some projects need environment variables for commands or agent tools.

1. Open the workspace context menu.
2. Choose the environment action.
3. Add variables in the supported format.
4. Save and rerun commands or threads that need them.

> Screenshot needed: capture the workspace environment dialog opened from a workspace menu.

## Open With External Apps

In the desktop app, workspaces and files can be opened with installed applications.

1. Choose `Open With` in the title bar or context menu.
2. Pick VS Code, Cursor, Xcode, Finder, or another detected app.
3. Set a default app from Settings if desired.

## Reindex Files

File search and command palette results depend on the workspace index.

1. Open the workspace context menu.
2. Choose `Reindex Files`.
3. Wait for the file tree or command palette to refresh.

Use this after large file moves, dependency changes, or generated-file cleanup.
