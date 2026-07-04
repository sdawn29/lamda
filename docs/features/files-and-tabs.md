# Files and Tabs

lamda lets you browse the workspace file tree, search files, open source files in tabs, inspect code with Monaco, view diagnostics, and keep code next to chat while the agent works.

> Screenshot needed: capture `/workspace/<threadId>` with the right file tree open and a source file tab active in the center tab bar.

## Open the File Tree

1. Open a workspace thread.
2. Toggle the file tree from the title bar, right panel, or command palette.
3. Expand folders.
4. Click a file to open it in a tab.

The file tree follows the active thread's worktree when a thread is running in one.

## Search Files

1. Open the file tree.
2. Use the search control.
3. Type part of a file name or path.
4. Select a result to open it.

You can also search files from the command palette.

> Screenshot needed: capture the file search modal with results visible.

## Use File Tabs

1. Click a file in the tree or command palette.
2. The file opens in the main tab bar.
3. Open more files as needed.
4. Switch between chat threads and file tabs from the tab bar.
5. Close tabs you no longer need.

File tabs are useful when asking the agent about nearby code because you can keep context visible while chatting.

## Read Diagnostics

When LSP is configured, opened files can show diagnostics.

1. Open a supported source file.
2. Review inline markers or the problems strip.
3. Use diagnostics as context in chat.
4. Ask the agent to fix issues in `Agent` mode or explain them in `Ask` mode.

See [LSP](lsp.md).

## Open Files Externally

In the desktop app:

1. Open a file tab or file context menu.
2. Use `Open With`.
3. Pick an external editor.

Set defaults in Settings or workspace options.

## Reindex the File List

1. Open the workspace context menu.
2. Choose `Reindex Files`.
3. Wait for the file tree and command palette results to refresh.

Use this after large generated-file changes or branch switches.
