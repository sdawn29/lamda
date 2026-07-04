# Settings

Settings control provider credentials, chat behavior, appearance, git integrations, memory, keyboard shortcuts, MCP, LSP, retry behavior, updates, usage, and data management.

> Screenshot needed: capture `/settings/appearance` with the settings sidebar and appearance controls visible.

## Open Settings

1. Click the settings button in the sidebar or title bar.
2. Or press `Cmd/Ctrl + ,`.
3. Or open the command palette and run `Open Settings`.

Settings routes use `/settings/<section>`, so pages can be linked directly.

## Sections

| Section       | Route                     | Use it for                                                          |
| ------------- | ------------------------- | ------------------------------------------------------------------- |
| Appearance    | `/settings/appearance`    | Mode, color theme, custom theme editor, UI font, code font          |
| Chat          | `/settings/chat`          | Thinking visibility, response display, title generation             |
| Subscriptions | `/settings/subscriptions` | OAuth sign-in for Claude Pro, ChatGPT/Codex, GitHub Copilot, Google |
| API Keys      | `/settings/api-keys`      | Key-based provider credentials                                      |
| Local Models  | `/settings/local-models`  | OpenAI-compatible local/self-hosted providers                       |
| AI Usage      | `/settings/usage`         | Token, cost, provider, model, and workspace usage reports           |
| Git           | `/settings/git`           | Commit-message prompts and GitHub/GitLab connection settings        |
| Memory        | `/settings/memory`        | Saved lessons, memory controls, self-healing behavior               |
| Shortcuts     | `/settings/shortcuts`     | Keyboard shortcut bindings                                          |
| MCP Servers   | `/settings/mcp`           | Model Context Protocol server definitions                           |
| LSP Config    | `/settings/lsp`           | Language server commands and install status                         |
| Retry         | `/settings/retry`         | Provider timeout and retry behavior                                 |
| About         | `/settings/about`         | App version, updates, links, and data reset                         |

## Configure API Keys

1. Open `/settings/api-keys`.
2. Find the provider.
3. Enter the key.
4. Save.
5. Return to chat and select a model from that provider.

Keys are stored in `~/.pi/agent/auth.json`.

## Sign In with Subscriptions

1. Open `/settings/subscriptions`.
2. Choose a supported OAuth provider.
3. Complete the browser or CLI sign-in flow.
4. Confirm the provider appears connected.
5. Select its models in the chat composer.

## Add Local Models

1. Start your local model server, such as Ollama, LM Studio, vLLM, or another OpenAI-compatible endpoint.
2. Open `/settings/local-models`.
3. Add a provider name, base URL, and model list.
4. Save.
5. Pick the local model in chat.

> Screenshot needed: capture `/settings/local-models` with the add provider form open.

## Customize Appearance

1. Open `/settings/appearance`.
2. Choose light, dark, or system mode.
3. Pick a built-in color theme.
4. Select UI and code fonts.
5. Use the custom theme editor if you need exact colors.

See [Themes](themes.md).

## Review Usage

1. Open `/settings/usage`.
2. Pick a date range.
3. Compare usage by model, provider, workspace, and thread.
4. Use the data to adjust default models or thinking levels.

> Screenshot needed: capture `/settings/usage` with a populated usage chart.

## Configure Git Hosting

1. Open `/settings/git`.
2. Connect GitHub or GitLab if available.
3. Configure AI commit-message generation.
4. Return to the source-control panel to use hosting-specific review views.

See [Git Hosting](git-hosting.md).

## Change Shortcuts

1. Open `/settings/shortcuts`.
2. Click a binding.
3. Press the new key combination.
4. Resolve conflicts if the UI reports one.

> Screenshot needed: capture `/settings/shortcuts` while recording a shortcut.

## Manage Memory

1. Open `/settings/memory`.
2. Review saved lessons or memories.
3. Remove stale entries.
4. Adjust self-healing behavior if the agent should or should not learn from errors.

## Configure Retry

1. Open `/settings/retry`.
2. Adjust provider timeout, retry count, and delay settings.
3. Save.
4. Retry the failed chat turn.

Increase timeouts for slow local models or overloaded providers.

## Reset or Inspect Data

1. Open `/settings/about`.
2. Review app version and update status.
3. Use data-management actions carefully.

Reset actions can remove local lamda records. Back up anything important first.
