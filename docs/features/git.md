# Git Integration Guide

Lamda provides a complete git workflow directly in the application — view diffs, stage files, commit changes, manage branches, and handle stashes without leaving your workspace.

## Overview

The Git panel shows your repository's status and provides tools for git operations:

```
┌─────────────────────────────────────────────────────────────────┐
│ Git                                                             │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐│
│ │ Branch: main ▾                            [Commit] [+3/-2] ││
│ └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│ Staged (2 files)                                               │
│ ┌───────────────────────────────────────────────────────────┐ │
│ │ M  src/auth.ts ─ Login redirect timing fix                  │ │
│ │ A  src/components/Button.tsx ─ New button component         │ │
│ └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│ Unstaged (1 file)                                              │
│ ┌───────────────────────────────────────────────────────────┐ │
│ │ M  src/styles.css ─ Update button colors                   │ │
│ └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│ Untracked (1 file)                                             │
│ ┌───────────────────────────────────────────────────────────┐ │
│ │ ??  test/new-test.ts                                       │ │
│ └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌───────────────────────────────────────────────────────────┐ │
│ │ [Stage All]  [Unstage All]  [Stash]                       │ │
│ └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Viewing Changes

### Git Status

The status section shows four categories:

| Category | Description |
|----------|-------------|
| **Staged** | Changes ready to commit (green checkmark area) |
| **Unstaged** | Modified files not yet staged |
| **Untracked** | New files not tracked by git |
| **Stashed** | Temporarily stored changes |

### Status Badges

| Badge | Meaning |
|-------|---------|
| M (blue) | Modified file |
| A (green) | Added file |
| D (red) | Deleted file |
| R (orange) | Renamed file |
| ?? (gray) | Untracked file |

### Viewing Diffs

1. Click on a file to expand its diff view
2. The diff shows:
   - Line numbers (old and new)
   - Deletions in red
   - Aditions in green
   - Context lines in gray
3. Syntax highlighting for code files

## Staging Operations

### Stage Individual Files

1. Hover over the file in Unstaged section
2. Click the **Stage** button (plus icon)
3. File moves to Staged section

### Unstage Files

1. Hover over the file in Staged section
2. Click the **Unstage** button (minus icon)
3. File returns to Unstaged section

### Stage All Changes

1. Click **Stage All** at the bottom of Unstaged section
2. All unstaged changes move to Staged

### Unstage All

1. Click **Unstage All** at the bottom of Staged section
2. All staged changes return to Unstaged

## Committing

### Creating a Commit

1. Stage the files you want to commit
2. Click **Commit** in the branch header
3. Fill in the commit dialog:

```
┌─────────────────────────────────────────────────────────────────┐
│ Create Commit                                                   │
│                                                                 │
│ Type: ┌─────────────── ▾                                       │
│        │ feat        │                                          │
│        │ fix         │                                          │
│        │ refactor    │                                          │
│        │ docs        │                                          │
│        │ test        │                                          │
│        │ chore       │                                          │
│        └──────────────┘                                          │
│                                                                 │
│ Scope: [optional ────────────]                                 │
│                                                                 │
│ Subject: [Brief description * ───────────────────────────] 50  │
│                                                                 │
│ Body:                                                           │
│ ┌───────────────────────────────────────────────────────────┐ │
│ │ [Detailed explanation (optional)                          │ │
│ └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│ Footer: [Closes #123 (optional) ───────────────────────────]   │
│                                                                 │
│ [Generate from Diff]                                            │
│                                                                 │
│                      [Cancel]  [Create Commit]                │
└─────────────────────────────────────────────────────────────────┘
```

### Commit Message Format

Uses conventional commit format:

```
<type>(<scope>): <subject>

<body>

<footer>
```

Examples:
- `feat(auth): add login redirect timeout`
- `fix(Button): resolve click handler issue`
- `docs(readme): update installation instructions`

### Generating Commit Messages

Click **Generate from Diff** to let the AI create a commit message based on your changes.

### Revert Changes

To discard changes to a file:

1. Expand the file in Unstaged section
2. Click **Revert**
3. Confirm in the dialog
4. File reverts to HEAD state

## Branch Management

### Switching Branches

1. Click the **Branch** dropdown in the Git header
2. Select a branch from the list
3. If you have unstaged changes, choose:
   - **Stash and Switch** — Save changes temporarily
   - **Discard and Switch** — Lose unsaved changes
   - **Cancel** — Don't switch

### Creating a Branch

1. Click the **Branch** dropdown
2. Click **Create Branch** at the bottom
3. Enter the branch name
4. Click **Create**
5. New branch is created and checked out

## Stash Operations

Stashes let you temporarily store changes to switch context.

### Creating a Stash

1. Click **Stash** at the bottom of the Git panel
2. Optionally enter a message describing the stash
3. Click **Create Stash**
4. Your changes are safely stored and working tree is clean

### Viewing Stashes

Stashes appear in the **Stashed** section:

```
Stashed (2)
stash@{0}: WIP on main: abc123 Fix login bug
stash@{1}: WIP on feature: def456 Add dark mode
```

### Restoring Stashes

**Pop Stash** (apply and delete):
1. Click **Pop** next to the stash
2. Changes are restored and stash is removed

**Apply Stash** (apply without deleting):
1. Click **Apply** next to the stash
2. Changes are restored but stash remains

**Drop Stash** (delete without applying):
1. Click **Drop** next to the stash
2. Confirm in the dialog
3. Stash is permanently deleted

## Diff Statistics

The header shows aggregate changes:

```
[Commit] [+3/-2]
```

- `+3` — Total lines added
- `-2` — Total lines deleted

Click to expand file-by-file breakdown.

## Terminal Integration

For advanced git operations, use the embedded terminal:

```bash
# Interactive rebase
git rebase -i HEAD~3

# Force push (use with caution!)
git push --force-with-lease

# Amend last commit
git commit --amend

# View blame
git blame src/auth.ts
```

## Troubleshooting

### "Not a git repository"

If you see this error:
1. The folder is not a git repository
2. Click **Initialize Repository** to run `git init`
3. Or clone a repository into the workspace

### "Merge Conflict Detected"

1. Resolve conflicts in the files
2. Stage the resolved files
3. Complete the merge/rebase with terminal

### "Permission Denied" (Push)

1. Verify your remote URL is correct
2. Set up authentication (SSH key or token)
3. Try pushing again

## Related

- [Chat Interface](chat.md) — How the agent uses git
- [Terminal](terminal.md) — Command-line access
- [API Reference](../api.md) — Git API endpoints