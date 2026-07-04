# lamda Documentation

lamda is a local-first desktop coding workspace for running Pi coding agent sessions against real repositories. It combines chat, code browsing, git review, terminals, scheduled agent work, provider management, MCP servers, and desktop integrations in one application.

## Start Here

| Goal                     | Page                                  |
| ------------------------ | ------------------------------------- |
| Install and launch lamda | [Getting Started](getting-started.md) |
| Get productive quickly   | [Quick Start](quick-start.md)         |
| Learn the app layout     | [Workspaces](features/workspaces.md)  |
| Configure providers      | [Providers](providers.md)             |
| Understand the internals | [Architecture](architecture.md)       |

## User Guides

| Feature                | Guide                                          | What you will learn                                                                                         |
| ---------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Workspaces and threads | [Workspaces](features/workspaces.md)           | Create workspaces, clone repositories, manage threads, pin, archive, and fork work                          |
| Chat                   | [Chat](features/chat.md)                       | Send prompts, choose modes, attach context, approve tools, answer questions, and compact long conversations |
| Files and tabs         | [Files and Tabs](features/files-and-tabs.md)   | Browse files, search the tree, open tabs, inspect code, and use diagnostics                                 |
| Git                    | [Git](features/git.md)                         | Review changed files, compare turns, stage, commit, branch, stash, push, and revert                         |
| GitHub and GitLab      | [Git Hosting](features/git-hosting.md)         | Connect hosting accounts, inspect PR/MR context, create PRs/MRs, and review CI status                       |
| Terminal               | [Terminal](features/terminal.md)               | Open persistent terminal tabs, run commands, and use task-launched shells                                   |
| Tasks                  | [Tasks](features/tasks.md)                     | Save frequently used shell commands per workspace                                                           |
| Automations            | [Automations](features/automations.md)         | Schedule recurring prompts that run while the app is open                                                   |
| Command palette        | [Command Palette](features/command-palette.md) | Navigate, search files, toggle panels, and run actions from the keyboard                                    |
| Skills                 | [Skills](features/skills.md)                   | Search, install, inspect, and remove global agent skills                                                    |
| MCP servers            | [MCP](features/mcp.md)                         | Connect external tools through Model Context Protocol                                                       |
| LSP diagnostics        | [LSP](features/lsp.md)                         | Configure language servers and read code diagnostics in the file viewer                                     |
| Settings               | [Settings](features/settings.md)               | Configure appearance, chat, API keys, subscriptions, usage, memory, shortcuts, retry, and data              |
| Themes                 | [Themes](features/themes.md)                   | Pick built-in themes, edit custom themes, and configure fonts                                               |
| Desktop app            | [Desktop](features/desktop.md)                 | Use native folder picking, open-with apps, server recovery, and updates                                     |

## Reference

| Page                                   | Description                                                             |
| -------------------------------------- | ----------------------------------------------------------------------- |
| [API Reference](api.md)                | Hono server routes used by the app                                      |
| [Providers](providers.md)              | Supported AI providers, API keys, OAuth subscriptions, and local models |
| [Settings Reference](settings.md)      | Low-level settings file locations and examples                          |
| [Screenshot Checklist](screenshots.md) | Capture list for replacing screenshot placeholders                      |
| [CLI Reference](cli.md)                | Development and package commands                                        |
| [Contributing](contributing.md)        | Repository workflow for contributors                                    |

## Application Overview

> Screenshot needed: capture the main workspace route at `/workspace/<threadId>` with the left workspace sidebar open, a chat thread selected, the right source-control panel open on the `Turns` view, and the terminal panel open at the bottom.

The first screen after setup is usually a workspace thread. The left sidebar holds workspaces and threads. The center area holds chat threads and file tabs. The right panel can show source control, GitHub/GitLab review views, file trees, and opened file content. The bottom panel holds persistent terminal tabs.

## Core Workflow

1. Configure at least one AI provider in [Settings](features/settings.md) or [Providers](providers.md).
2. Create a workspace from a local folder or clone a repository.
3. Open a thread and choose `Agent`, `Ask`, or `Plan` mode.
4. Ask the agent to inspect, explain, modify, or review code.
5. Watch tool calls, file changes, todos, questions, and approvals in the chat.
6. Review changes in the Git panel, stage what you want, and commit.
7. Use terminals, tasks, MCP servers, skills, and automations when the workflow needs more power.

## Quick Commands

```sh
npm install
npm run dev
npm run build
npm run check-types
```

## Data Storage

| Location                     | Purpose                                                                |
| ---------------------------- | ---------------------------------------------------------------------- |
| `~/.lamda-code/db-v2.sqlite` | Workspaces, threads, messages, tasks, automations, and local app state |
| `~/.pi/agent/auth.json`      | Provider API keys and OAuth credentials                                |
| `~/.lamda-code/logs/`        | Application logs                                                       |
| `~/.lamda/skills`            | Globally installed agent skills                                        |

## Project Status

lamda is functional and evolving. It supports chat streaming, thread modes, git workflows, persistent terminals, file tabs, LSP diagnostics, MCP servers, skills, automations, local model providers, usage tracking, themes, GitHub/GitLab integrations, and Electron desktop features. Automated test coverage is still limited, and packaged desktop builds currently target macOS arm64.
