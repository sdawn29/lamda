# Command Palette

The command palette is the fastest way to navigate and run app actions from the keyboard.

> Screenshot needed: capture `/workspace/<threadId>` with the command palette open and file results plus commands visible.

## Open It

Press `Cmd/Ctrl + K`, or use the command-palette action from the UI.

## Search Files

1. Open the command palette.
2. Type part of a file path.
3. Select a file result.
4. The file opens in a tab.

File results use the active workspace or the workspace selected on the new-thread route.

## Navigate Threads

1. Open the command palette.
2. Search for a thread title or workspace name.
3. Select the thread.
4. lamda navigates to `/workspace/<threadId>`.

## Run Common Actions

The palette includes actions such as:

| Action              | Result                                             |
| ------------------- | -------------------------------------------------- |
| New Thread          | Opens the new-thread flow for the active workspace |
| New Workspace       | Opens workspace creation                           |
| Toggle Sidebar      | Shows or hides the workspace sidebar               |
| Toggle Terminal     | Shows or hides the terminal panel                  |
| Toggle Review Panel | Shows or hides source control                      |
| Toggle File Tree    | Shows or hides the file tree                       |
| Fullscreen Diff     | Expands the diff viewer                            |
| Open Settings       | Opens the default settings section                 |
| Open Usage          | Opens AI usage settings                            |
| Open Memory         | Opens memory settings                              |
| Open MCP            | Opens MCP settings                                 |
| Toggle Theme        | Switches light and dark mode                       |

## Keyboard Hints

Shortcut hints appear beside commands when a binding exists. Change bindings in `Settings -> Shortcuts`.
