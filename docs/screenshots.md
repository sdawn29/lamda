# Screenshot Checklist

Use this checklist to replace the `Screenshot needed` callouts throughout the docs site. Capture screenshots with realistic project data, but avoid showing private API keys, tokens, customer data, or proprietary repository content.

## First Run and Setup

| Page                          | Capture                                          |
| ----------------------------- | ------------------------------------------------ |
| [Quick Start](quick-start.md) | `/onboard` or `/` after first launch             |
| [Quick Start](quick-start.md) | `/settings/api-keys` with provider cards visible |
| [Quick Start](quick-start.md) | Create workspace dialog from `/`                 |

## Main Workspace

| Page                                 | Capture                                                                                              |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| [Home](index.md)                     | `/workspace/<threadId>` with left sidebar, chat, source-control panel on `Turns`, and terminal open  |
| [Workspaces](features/workspaces.md) | `/workspace/<threadId>` with left sidebar open, multiple workspaces expanded, pinned threads visible |
| [Workspaces](features/workspaces.md) | Clone repository tab in the create workspace dialog                                                  |
| [Workspaces](features/workspaces.md) | Workspace environment dialog from a workspace menu                                                   |

## Chat

| Page                     | Capture                                                                          |
| ------------------------ | -------------------------------------------------------------------------------- |
| [Chat](features/chat.md) | `/workspace/<threadId>` with assistant message, composer, and expanded tool call |
| [Chat](features/chat.md) | Composer with `@` file mention dropdown open                                     |
| [Chat](features/chat.md) | Question card in the chat stream                                                 |
| [Chat](features/chat.md) | User message hover state with fork action visible                                |
| [Chat](features/chat.md) | Context usage indicator or chart inside a busy thread                            |

## Files, LSP, and Palette

| Page                                           | Capture                                                                |
| ---------------------------------------------- | ---------------------------------------------------------------------- |
| [Files and Tabs](features/files-and-tabs.md)   | `/workspace/<threadId>` with file tree open and source file tab active |
| [Files and Tabs](features/files-and-tabs.md)   | File search modal with results                                         |
| [LSP](features/lsp.md)                         | `/settings/lsp` with language server entries and install status        |
| [LSP](features/lsp.md)                         | File tab with diagnostics visible in Monaco                            |
| [Command Palette](features/command-palette.md) | Command palette open with file results and commands                    |

## Git and Hosting

| Page                                   | Capture                                                    |
| -------------------------------------- | ---------------------------------------------------------- |
| [Git](features/git.md)                 | Source-control panel on `Turns` with changed file and diff |
| [Git](features/git.md)                 | Fullscreen diff mode                                       |
| [Git](features/git.md)                 | Commit dialog with staged files                            |
| [Git Hosting](features/git-hosting.md) | `/settings/git` with GitHub and GitLab connection controls |
| [Git Hosting](features/git-hosting.md) | `GitHub` source-control view with connected repository     |
| [Git Hosting](features/git-hosting.md) | Create PR dialog                                           |
| [Git Hosting](features/git-hosting.md) | Create MR dialog                                           |

## Terminal, Tasks, and Automations

| Page                                   | Capture                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------ |
| [Terminal](features/terminal.md)       | Bottom terminal panel open with one tab running `git status` and another tab visible |
| [Tasks](features/tasks.md)             | Tasks dropdown open with several saved tasks                                         |
| [Automations](features/automations.md) | `/automations` with enabled and disabled automations                                 |
| [Automations](features/automations.md) | Automation form dialog                                                               |
| [Automations](features/automations.md) | Automation run history dialog                                                        |

## Settings and Extensibility

| Page                             | Capture                                                              |
| -------------------------------- | -------------------------------------------------------------------- |
| [Settings](features/settings.md) | `/settings/appearance` with settings sidebar and appearance controls |
| [Settings](features/settings.md) | `/settings/local-models` with add provider form open                 |
| [Settings](features/settings.md) | `/settings/usage` with populated usage chart                         |
| [Settings](features/settings.md) | `/settings/shortcuts` while recording a shortcut                     |
| [Themes](features/themes.md)     | `/settings/appearance` with theme swatch grid                        |
| [Themes](features/themes.md)     | Custom theme editor                                                  |
| [MCP](features/mcp.md)           | `/settings/mcp` with server list                                     |
| [MCP](features/mcp.md)           | Add MCP server dialog                                                |
| [Skills](features/skills.md)     | `/skills` with popular skills, installed skills, and search field    |
| [Skills](features/skills.md)     | `/skills/<id>` for an installed skill                                |

## Desktop

| Page                           | Capture                                                           |
| ------------------------------ | ----------------------------------------------------------------- |
| [Desktop](features/desktop.md) | Desktop app window with title bar and workspace open              |
| [Desktop](features/desktop.md) | `Open With` menu in the title bar                                 |
| [Desktop](features/desktop.md) | Server unavailable screen, if reproducible                        |
| [Desktop](features/desktop.md) | Update dialog or update settings section with a downloaded update |
