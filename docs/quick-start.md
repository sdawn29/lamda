# Quick Start

This guide gets lamda running and walks through the first useful coding session.

## 1. Install

Prerequisites:

| Requirement         | Notes                                     |
| ------------------- | ----------------------------------------- |
| Node.js             | 18 or newer                               |
| npm                 | 11 or newer                               |
| Git                 | Required for workspace git features       |
| macOS Apple Silicon | Required only for packaged desktop builds |

```bash
git clone https://github.com/sdawn29/lambda.git
cd lambda
npm install
```

## 2. Start lamda

```bash
npm run dev
```

This starts the web UI, server, and Electron desktop shell through Turborepo.

| Component | Default location        |
| --------- | ----------------------- |
| Web UI    | `http://localhost:5173` |
| Server    | `http://localhost:3001` |
| Desktop   | Electron window         |

> Screenshot needed: capture the first app window after `npm run dev`, either the onboarding screen at `/onboard` or the empty workspace screen at `/`.

## 3. Configure an AI Provider

1. Open Settings from the sidebar, title bar, or command palette.
2. Go to `API Keys` for key-based providers or `Subscriptions` for OAuth providers.
3. Add credentials for Anthropic, OpenAI, DeepSeek, Google Gemini, GitHub Copilot, or another supported provider.
4. Open `Local Models` if you use Ollama, LM Studio, vLLM, or another OpenAI-compatible local server.
5. Return to a thread and choose a model from the chat composer.

> Screenshot needed: capture `/settings/api-keys` with at least one provider card visible.

## 4. Create a Workspace

1. Click `New Workspace` in the sidebar or open the command palette and run `New Workspace`.
2. Choose a local folder or enter a Git URL to clone.
3. Confirm the path.
4. lamda creates the workspace and opens a new thread.

> Screenshot needed: capture the create workspace dialog opened from `/`.

## 5. Start a Thread

1. Pick a mode in the composer:
   - `Agent` lets the agent read, edit, run commands, and complete the task.
   - `Ask` keeps the agent read-only for explanations and review.
   - `Plan` asks the agent to propose a plan before executing.
2. Type a prompt, for example:

```text
Please explore this codebase and explain the main architecture.
```

3. Watch the response stream. Tool calls, file changes, todos, questions, approvals, and errors appear inline.

> Screenshot needed: capture `/workspace/<threadId>` after a first successful response with at least one tool call visible.

## 6. Review Code Changes

1. Open the right source-control panel.
2. Use `Turns` to review changes from the latest agent turn.
3. Switch to `All Changes` for the full working tree.
4. Open a file diff, stage selected changes, and commit.

> Screenshot needed: capture `/workspace/<threadId>` with the right panel open on `Turns` and a changed file selected.

## 7. Use the Terminal

1. Open the terminal panel from the title bar or command palette.
2. Run project commands such as `npm test`, `npm run build`, or `git status`.
3. Create more tabs when you need long-running commands and quick one-off checks side by side.

> Screenshot needed: capture `/workspace/<threadId>` with the bottom terminal panel open and two terminal tabs visible.

## Essential Shortcuts

| Shortcut           | Action                             |
| ------------------ | ---------------------------------- |
| `Cmd/Ctrl + K`     | Open command palette               |
| `Cmd/Ctrl + Enter` | Send chat message                  |
| `Shift + Enter`    | Add a line break in the composer   |
| `Cmd/Ctrl + ,`     | Open settings                      |
| `Escape`           | Close dialogs or cancel focused UI |

Shortcuts can be changed in `Settings -> Shortcuts`.

## Next Steps

Read [Chat](features/chat.md), [Git](features/git.md), [Files and Tabs](features/files-and-tabs.md), [Terminal](features/terminal.md), and [Settings](features/settings.md) for the everyday workflow. Then add [MCP servers](features/mcp.md), [skills](features/skills.md), [tasks](features/tasks.md), or [automations](features/automations.md) as your projects need them.
