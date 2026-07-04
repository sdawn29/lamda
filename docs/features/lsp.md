# LSP Diagnostics

lamda can connect language servers to the Monaco file viewer so opened files show diagnostics and code intelligence.

> Screenshot needed: capture `/settings/lsp` with language server entries and install status visible.

## Configure Language Servers

1. Open `Settings -> LSP Config`.
2. Review supported languages and commands.
3. Install missing language servers when the UI offers an install action.
4. Adjust command paths if your tools live outside standard locations.

## View Diagnostics

1. Open a workspace thread.
2. Open a source file in a tab.
3. Look for diagnostics in the editor, problems strip, or outline panel.
4. Use those diagnostics as context in chat.

> Screenshot needed: capture a file tab with diagnostics visible in the Monaco viewer.

## Use Diagnostics with the Agent

Good prompts:

```text
Explain the TypeScript errors in the open file.
```

```text
Fix the diagnostics in this file, then run the type checker.
```

Use `Ask` mode for explanation and `Agent` mode for fixes.

## Troubleshooting

| Problem                        | Try                                                                     |
| ------------------------------ | ----------------------------------------------------------------------- |
| No diagnostics appear          | Confirm the file type is supported and the language server is installed |
| Server command not found       | Update the command path in `Settings -> LSP Config`                     |
| Diagnostics are stale          | Reopen the file tab or restart the language server if available         |
| Too many generated-file errors | Exclude generated folders through project config where possible         |
