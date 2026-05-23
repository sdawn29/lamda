# Workspaces Guide

Workspaces are the top-level organizational unit in lamda. Each workspace represents a repository (local folder), and contains multiple conversation threads for different tasks.

## Overview

```
┌─────────────────────────────────────────────────────────────────┐
│ Workspaces                                                      │
│                                                                 │
│ ▼ my-project                                                   │
│   ├ 🤖 Fix login bug                          [📌]             │
│   ├ 💬 Add dark mode                          [📌]             │
│   └ 💬 Refactor API endpoints                                 │
│                                                                 │
│ ▼ another-repo                                                 │
│   ├ 🤖 Setup CI/CD                                           │
│   └ 💬 Review pull request                                   │
│                                                                 │
│ ▼ archived                                                     │
│   └── 🔒 Old investigation                                   │
│                                                                 │
│ [+ New Workspace]                                              │
└─────────────────────────────────────────────────────────────────┘
```

## What is a Workspace?

A workspace contains:
- **Path**: Local folder on your machine
- **Name**: Derived from the folder name
- **Threads**: Multiple conversation threads
- **MCP Config**: Model Context Protocol server settings

## What is a Thread?

A thread is a conversation about a specific task:
- Has its own chat history
- Can use a different AI model
- Tracks its own context and state
- Can be pinned or archived

## Creating a Workspace

### From Local Folder

1. Click **+ New Workspace**
2. Select **Local Folder** tab
3. Click **Browse** and select a folder
4. Click **Create Workspace**

Or drag a folder onto the sidebar.

### By Cloning a Repository

1. Click **+ New Workspace**
2. Select **Clone Repository** tab
3. Enter the git URL (e.g., `https://github.com/user/repo.git`)
4. Optionally specify a local path
5. Click **Clone and Create**

```bash
# Example URLs
https://github.com/user/my-project.git
git@github.com:user/my-project.git
https://gitlab.com/user/repo.git
```

## Managing Threads

### Creating a Thread

1. Hover over a workspace
2. Click the **+** button that appears
3. New thread is created and opened

### Renaming a Thread

1. Click on the thread title (in sidebar or title bar)
2. Type the new name
3. Press **Enter** to save

### Deleting a Thread

1. Right-click on the thread
2. Select **Delete Thread**
3. Confirm in the dialog

> ⚠️ This permanently deletes the thread and its chat history.

### Archiving a Thread

Archiving keeps the thread for reference without cluttering your sidebar:

1. Right-click on the thread
2. Select **Archive Thread**

Archived threads appear under a collapsed **Archived** section.

### Viewing Archived Threads

1. Click **Archived** at the bottom of the sidebar
2. View all archived threads across workspaces
3. Click to expand a thread and continue the conversation
4. Right-click for **Unarchive** option

### Pinning a Thread

Pinned threads appear at the top of their workspace:

1. Right-click on the thread
2. Select **Pin Thread**

Pinned threads show a 📌 icon.

### Switching Threads

Click any thread in the sidebar to switch to it:
- Chat history loads automatically
- Git status updates to workspace state
- Terminal starts in workspace directory

## Workspace Settings

### Per-Workspace Preferences

Right-click on a workspace for options:
- **Open with App** — Choose external editor
- **Reindex Files** — Rebuild file index for search
- **Delete Workspace** — Remove from lamda

### "Open With" Editor

Launch files in your preferred editor:

1. Right-click workspace → **Open With**
2. Select an editor from the list:
   - Visual Studio Code
   - Cursor
   - Xcode
   - etc.

3. The selected editor opens automatically

### Setting Default Editor

1. Open **Settings** → **General**
2. Find **Default Open With App**
3. Select your preferred editor
4. All workspaces will use this editor by default

## Switching Workspaces

### Sidebar Navigation

Click any workspace in the sidebar to switch to it:
- Workspace expands to show threads
- Thread list loads
- Last active thread is opened

### Quick Switch

Press the keyboard shortcut for sidebar toggle, then:
- Use arrow keys to navigate
- Press Enter to select

## Data Storage

### What Gets Stored

| Data | Location |
|------|----------|
| Workspace metadata | SQLite |
| Thread history | SQLite |
| Chat messages | SQLite |
| MCP configurations | SQLite |
| API keys | `~/.pi/agent/auth.json` |
| Settings | `~/.pi/agent/settings.json` |

### Database Location

SQLite database stored at: `~/.lamda-code/db.sqlite`

### Exporting Data

Thread export functionality:
1. Right-click on thread
2. Select **Export Thread**
3. Choose format (JSON, Markdown)
4. Save to your preferred location

## Multiple Workspaces

### Workflow Example

```
Workspace: frontend-app
├── Thread: Fix navigation bug
├── Thread: Add user settings
└── Thread: Optimize performance

Workspace: backend-api
├── Thread: Add authentication
├── Thread: Database migration
└── Thread: Write API docs

Workspace: docs-site
├── Thread: Update getting started
└── Thread: Fix broken links
```

### Best Practices

- **One workspace per repository** — Keeps git context clear
- **One thread per task** — Avoids confusion in conversations
- **Name threads descriptively** — `Fix login redirect` not `login`
- **Archive completed threads** — Keep sidebar clean, preserve history

## Troubleshooting

### "Workspace not found"

If lamda can't find a workspace folder:
1. The folder may have been moved or deleted
2. Right-click → **Remove Missing Workspace**
3. Optionally re-create by opening the folder again

### "Git repository not initialized"

Workspaces don't require git, but operations fail without it:
1. Open the terminal in that workspace
2. Run `git init` to initialize
3. Or clone a git repository when creating

### High Memory Usage

Many workspaces can use memory:
- Each thread maintains its own chat context
- Close completed threads you don't need
- Archive threads instead of keeping them active

## Related

- [Chat Interface](chat.md) — Thread conversation
- [Git Integration](git.md) — Workspace git operations
- [Settings](settings.md) — Workspace preferences
- [API Reference](../api.md) — Workspace API endpoints