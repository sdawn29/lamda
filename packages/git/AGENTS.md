# AGENTS.md — git

> Auto-generated context for coding agents. Last updated: 2026-04-26

## Purpose

Git operations utility — provides async functions for detecting git repositories, resolving branch names, and finding repo root directories.

## Quick Reference

| Action    | Command                                |
| --------- | -------------------------------------- |
| Typecheck | `npm run check-types -w @lamda/git` |

## Architecture

Single-file package (`src/index.ts`) that wraps `git` CLI commands via `child_process.execFile`. All functions are async and return `null` on failure (not a git repo, git not installed, timeout).

### Key Files

- `src/index.ts` — All exported functions: `getCurrentBranch`, `getRepoRoot`, `isGitRepo`, `listBranches`, `checkoutBranch`

## Public API

| Function                      | Returns                   | Description                                                 |
| ----------------------------- | ------------------------- | ----------------------------------------------------------- |
| `getCurrentBranch(cwd)`       | `Promise<string | null>` | Current branch name via `git rev-parse --abbrev-ref HEAD`   |
| `getRepoRoot(cwd)`            | `Promise<string | null>` | Absolute repo root path via `git rev-parse --show-toplevel` |
| `isGitRepo(cwd)`              | `Promise<boolean>`        | Whether cwd is inside a git repository                      |
| `listBranches(cwd)`           | `Promise<string[]>`       | All local branch names via `git branch --format`            |
| `checkoutBranch(cwd, branch)` | `Promise<void>`           | Checkout a branch (throws on failure)                       |

## Conventions

- **No test framework** — tests not configured
- **Source-only package** — exports point directly to `.ts` files, no build step
- **All functions are async** — even `isGitRepo` which wraps `getRepoRoot`
- **Graceful degradation** — all functions return `null`/`false` on error rather than throwing

## Dependencies

- Node.js `child_process` and `util` only — no external dependencies

## Gotchas

- **Requires `git` CLI** to be installed and on PATH — no pure-JS git implementation
- **3-second timeout** on all git commands — may be too short for very large repos on slow machines
- **Errors are silently swallowed** — if git command fails for any reason (not just "not a repo"), the function returns `null`/`false` without logging

## Related

- [apps/server](../../apps/server/AGENTS.md) — Uses `getCurrentBranch` for session context