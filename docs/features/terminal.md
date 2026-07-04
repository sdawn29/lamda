# Terminal

lamda includes persistent terminal tabs backed by a server-side PTY and rendered with xterm.js. Terminals start in the workspace directory or the active thread worktree.

> Screenshot needed: capture `/workspace/<threadId>` with the bottom terminal panel open, one active tab running `git status`, and another tab visible.

## Open the Terminal

1. Open a workspace thread.
2. Click the terminal button in the title bar or run `Toggle Terminal` from the command palette.
3. The bottom panel opens with a shell in the workspace root.

## Create and Switch Tabs

1. Click the plus button in the terminal panel.
2. Run a command in the new shell.
3. Click a tab to switch.
4. Close a tab when its process is no longer needed.

Terminal sessions persist across panel close/open and brief page reloads. Closing a tab ends that PTY session.

## Run Commands

Common examples:

```bash
git status
npm install
npm run dev
npm run build
npm run check-types
```

Use normal shell shortcuts such as `Ctrl+C`, `Ctrl+D`, `Ctrl+L`, tab completion, and command history.

## Launch from Tasks

Workspace tasks run in terminal tabs.

1. Open the tasks dropdown.
2. Click a saved task.
3. lamda opens or focuses a terminal tab and runs the command in the workspace root.

See [Tasks](tasks.md).

## Reconnect Behavior

If the web UI disconnects from the server:

1. The terminal shows a disconnected state.
2. The client keeps retrying.
3. When the server is reachable, the tab reattaches to the same PTY if it is still alive.

## Links and Paths

URLs in terminal output can be opened from the terminal. File paths can be copied into chat, opened through the file tree, or used with the command palette file search.

## Troubleshooting

| Problem                                             | Try                                                      |
| --------------------------------------------------- | -------------------------------------------------------- |
| Terminal says connecting forever                    | Confirm the server is running at `http://localhost:3001` |
| Command starts in the wrong folder                  | Check the active workspace and active thread worktree    |
| Shell behaves differently from your normal terminal | Check the shell configured by your system environment    |
| Output looks unreadable after resizing              | Close and reopen the terminal panel to force a fit       |
