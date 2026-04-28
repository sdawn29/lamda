# AGENTS.md — web/src/features/git

> Auto-generated context for coding agents. Last updated: 2026-04-28

## Purpose

Git feature module — implements diff rendering, branch management, staging/unstaging, committing, stash management, and status tracking for workspaces within the lamda application.

## Overview

The git module provides a complete git workflow UI (26 files, ~2400 lines). It manages:

1. **Workspace status tracking** — tracked files, untracked files, staged changes
2. **Diff rendering** — unified diff format with syntax highlighting and language detection
3. **Staging operations** — stage/unstage individual files or all changes
4. **Committing** — conventional commit message generation + validation
5. **Branch management** — list branches, checkout, create new branches
6. **Stash operations** — push, pop, apply, drop stashes with user messaging
7. **Diff statistics** — insertions/deletions per file and aggregate

## Architecture

```
┌─ DiffPanel.tsx (main exported component)
│  └─ Shows diff content, branch selector, file listing, stash management
│
├─ Data Management Layer
│  ├─ context.tsx — DiffPanelProvider + useDiffPanel (context state)
│  ├─ queries.ts — TanStack Query hooks (useGitDiffStat, useBranch, useBranches, gitStatus)
│  ├─ mutations.ts — TanStack Mutations (useCheckoutBranch, useCreateBranch, useInitializeGitRepository)
│  └─ api.ts — Server HTTP client (status, diff, branches, commit)
│
├─ Components Layer
│  ├─ DiffPanel.tsx — Main container (unrolled layout)
│  ├─ BranchSelector.tsx — Branch dropdown + checkout + create flow
│  ├─ CommitDialog.tsx — Commit form with conventional commit structure
│  ├─ DiffView.tsx — Syntax-highlighted diff renderer
│  ├─ DiffStat.tsx — Statistics display (file summary)
│  ├─ FilesSection.tsx — File list with stage/unstage/revert actions
│  ├─ FileAccordionItem.tsx — Single file row (name, status, diff preview)
│  ├─ FileHeader.tsx — File row header with quick actions
│  ├─ StatusBadge.tsx — Visual status indicator (M/A/D/etc. codes)
│  ├─ StashSection.tsx — Stash list display
│  ├─ StashEntryRow.tsx — Single stash entry (pop, apply, drop)
│  ├─ StashInputBar.tsx — Stash message input
│  └─ SortUtils.ts — Sorting helper (by status, name)
│
└─ Types
   └─ types.ts — Diff-related types (DiffMode, etc.)
```

## Key Files

### Data Management

- **`context.tsx`** (230 lines) — DiffPanel context + state
  - `DiffPanelContext` — Tracks:
    - `selectedFile` — Currently displayed diff
    - `expandedFiles` — Set of file paths to show previews
    - `showStashed` — Toggle stash section visibility
    - `gitStatus` — Raw `git status --short` output
    - `fileDiffs` — Map of `filepath → diff content`
  - `useDiffPanel()` — Hook to access context
  - Memoization for stability

- **`queries.ts`** — TanStack Query hooks
  - `useGitDiffStat(sessionId)` — Aggregate stats (`{additions, deletions}`) via `/session/:id/git/diffstat`
  - `useBranch(sessionId)` — Current branch name via `/session/:id/branch`
  - `useBranches(sessionId)` — List of branches via `/session/:id/branches`
  - `useGitStatus(sessionId)` — Raw git status output via `/session/:id/git/status`
  - `gitStatusKey` — Query key factory for git operations
  - All queries auto-retry on failure; 30-second refetch interval

- **`mutations.ts`** — TanStack Mutations
  - `useCheckoutBranch(sessionId)` — Switch to branch via `/session/:id/checkout`
  - `useCreateBranch(sessionId)` — Create + checkout new branch
  - `useInitializeGitRepository(sessionId)` — `git init` for non-git workspaces
  - `useStageFile(sessionId)`, `useUnstageFile(sessionId)` — Per-file operations
  - `useStageAll(sessionId)`, `useUnstageAll(sessionId)` — Bulk operations
  - `useRevertFile(sessionId)` — Discard changes to file
  - `useCommitChanges(sessionId)` — Commit staged changes + refresh queries
  - `useStashChanges(sessionId)` — Create stash
  - `usePopStash(sessionId)`, `useApplyStash(sessionId)`, `useDropStash(sessionId)` — Stash management
  - `useGenerateCommitMessage(diff)` — Call LLM for conventional commit
  - Error toast on mutation failure

- **`api.ts`** — Server HTTP client
  - `getGitStatus(sessionId)` — Fetch raw status
  - `getGitFileDiff(sessionId, filepath, statusCode)` — Fetch diff for single file
  - `getGitDiffStat(sessionId)` — Aggregate statistics
  - `getCurrentBranch(sessionId)` — Current branch
  - `getBranches(sessionId)` — List branches
  - `checkoutBranch(sessionId, branch)` — Switch branch
  - `createBranch(sessionId, branch)` — Create new branch
  - `commitChanges(sessionId, message)` — Commit staged changes
  - `stageFile(sessionId, filePath)` — Stage file
  - `unstageFile(sessionId, filePath)` — Unstage file
  - `stageAll(sessionId)` — Stage all
  - `unstageAll(sessionId)` — Unstage all
  - `revertFile(sessionId, filePath)` — Revert to HEAD
  - Stash operations (stash, pop, apply, drop, list)

### Main Component

- **`components/diff-panel.tsx`** (400+ lines) — Main UI container
  - Unrolled layout (all sections expanded by default)
  - Sections (top to bottom):
    1. Branch selector + stats
    2. Staged files section (with commit button)
    3. Unstaged files section (with stage-all button)
    4. Untracked files section
    5. Stash section (if `showStashed`)
  - Side panel: diff viewer for selected file
  - Error handling with retry buttons

### Components

- **`components/branch-selector.tsx`** — Dropdown UI
  - Current branch displayed as button
  - Dropdown lists all branches
  - "Create Branch" option at bottom
  - Branch switch confirmation dialog if changes exist

- **`components/commit-dialog.tsx`** (150+ lines) — Commit form modal
  - Type selector (feat, fix, refactor, docs, etc.)
  - Scope input (optional)
  - Subject input (max 50 chars, enforced)
  - Body input (multiline, wrapped at 72 chars)
  - Footer input (e.g., `Fixes #123`)
  - "Generate from Diff" button (calls `/session/:id/title` with diff)
  - Validation: subject required, type required
  - Commit button submits message as: `{type}({scope}): {subject}\n\n{body}\n\n{footer}`

- **`components/diff-view.tsx`** (200+ lines) — Syntax-highlighted diff renderer
  - Unified diff format parser
  - Language detection via file extension
  - Code block syntax highlighting via `react-syntax-highlighter`
  - Line-by-line rendering with gutters (old/new line numbers)
  - Diff headers (`--- a/file`, `+++ b/file`)
  - Hunk headers (`@@ -1,5 +1,6 @@`)
  - Color-coded lines (red for deletions, green for additions, gray for context)
  - `detectLanguage(filename)` helper

- **`components/files-section.tsx`** — File list by status
  - Filters `git status --short` output by status code
  - Renders `FileAccordionItem` per file
  - Buttons at section header (stage-all, unstage-all, etc.)
  - Shows count (e.g., "Staged (3 files)")

- **`components/file-accordion-item.tsx`** — Single file row
  - File name + status badge
  - Quick action buttons (stage, unstage, revert, open)
  - Expandable diff preview (lazy-loaded)
  - File icon based on extension

- **`components/file-header.tsx`** — File row header
  - Checkbox for selection (future: multi-select actions)
  - File name with path
  - Diff stat (additions/deletions for this file)
  - Action buttons

- **`components/status-badge.tsx`** — Status code visual
  - M (modified) → blue
  - A (added) → green
  - D (deleted) → red
  - R (renamed) → orange
  - ?? (untracked) → gray

- **`components/stash-section.tsx`** — Stash management
  - Lists stashes (`git stash list` format: `stash@{0}: WIP on main: abc123 message`)
  - "New Stash" button at top
  - Stash entries as rows

- **`components/stash-entry-row.tsx`** — Single stash display
  - Stash name + message
  - Buttons: pop, apply, drop
  - Confirmation dialogs before destructive ops

- **`components/stash-input-bar.tsx`** — Stash message input
  - Text input for optional message
  - "Create Stash" button
  - Auto-close after successful stash

- **`components/diff-stat.tsx`** — Statistics display
  - Shows total additions/deletions
  - File count
  - "View Details" button to expand file-by-file breakdown

### Types & Utilities

- **`types.ts`** — Type definitions
  - `DiffMode` — "staged" | "unstaged" | "untracked" (which section is being displayed)
  - `FileStatus` — Enum-like (M, A, D, R, ?, etc.)

- **`sort-utils.ts`** — Sorting helper
  - Sort files by status (staged first, then alphabetical)
  - Used in `FilesSection` to maintain consistent ordering

## Conventions

- **Status codes are `git status --short` format** — first char = index, second char = working tree (e.g., "M " = modified, " M" = unstaged modification)
- **File diffs are lazy-loaded** — diff content fetched on first expand; memoized in context
- **Untracked files show full content as diff** — `git diff --no-index /dev/null <file>`
- **Stage/unstage per-file** — no bulk file selection UI yet (checkbox prepared for future)
- **Stash messages are user-provided** — server stores them as `git stash push -m "<message>"`
- **Commit message structure is enforced** — conventional commit format (type, scope, subject, body, footer)
- **Diff panel is **always visible** in the main layout** — not lazily rendered
- **Branch creation creates and checks out** — not just creates locally
- **Untracked files cannot be staged individually** — only "Create Stash" or "Stage All" includes them
- **Diff rendering is syntax-aware** — language auto-detected but can fall back to plaintext
- **File icons come from shared UI library** — not defined in git module
- **Error messages show specific git error** — e.g., "Merge conflict detected"
- **No undo within git module** — user must retry operation or use terminal
- **Stash names are auto-generated** — user message is optional; git generates `WIP on <branch>: <commit> <message>` format
- **Git must be initialized** — if `.git/` doesn't exist, operations fail; UI offers "Initialize Repository" button

## Related

- [apps/web](../../AGENTS.md) — Parent web app; git module is a feature
- [apps/server/src/routes/AGENTS.md](../../../../apps/server/src/routes/AGENTS.md) — `/session/:id/git/*` REST endpoints
- [packages/git](../../../../packages/git/AGENTS.md) — Git CLI wrappers (`getCurrentBranch`, `checkoutBranch`, etc.)
- [features/chat](./chat/AGENTS.md) — Chat module; can reference current branch context

## Common Workflows

### Staging and Committing

1. User edits files in editor
2. Git module fetches `git status --short` (via query)
3. Files appear in "Unstaged" section
4. User clicks file to view diff (lazy-loads `git diff HEAD -- <file>`)
5. User clicks "Stage All" → `git add -A` → query refetch
6. "Staged" section updates
7. User clicks "Commit" → CommitDialog opens
8. User fills subject, clicks "Commit" → POST `/session/:id/commit` → refreshes status

### Creating a Branch

1. User clicks branch selector dropdown
2. User clicks "Create Branch"
3. Input dialog appears
4. User enters name → POST `/session/:id/create-branch` → Branch created and checked out
5. Current branch indicator updates

### Reverting Changes

1. User expands file in "Unstaged" section
2. User clicks "Revert" button → Confirmation dialog
3. On confirm → `git restore <file>` → query refetch
4. File disappears from "Unstaged" section

### Stashing

1. User wants to switch branches but has uncommitted changes
2. User clicks "Create Stash" in Stash section
3. User enters optional message → `git stash push -u -m "<message>"` → Files cleared
4. After switching branches, user can "Pop" stash → `git stash pop stash@{0}` → Changes restored
