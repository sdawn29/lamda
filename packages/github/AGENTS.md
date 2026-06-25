# AGENTS.md — github

> GitHub integration utility. Wraps the GitHub CLI (`gh`) via `child_process.execFile`.

## Purpose

Thin, typed wrapper around the `gh` CLI for pull requests, issues, and CI checks.
Auth is delegated entirely to `gh` (the user's `gh auth` session) — this package
stores no tokens. Every function takes a `cwd` (the repo directory) so `gh`
resolves the repo from its git remote.

## Quick Reference

| Action    | Command                              |
| --------- | ------------------------------------ |
| Typecheck | `npm run check-types -w @lamda/github` |

## Architecture

Single-file package (`src/index.ts`). Mirrors `@lamda/git`: `execFile("gh", …)`
with argument validation (`assertNotOption`, `assertPositiveInt`).

- `getGhStatus(cwd)` never throws — degrades to `{installed:false, authenticated:false}`.
  Used to gate UI and agent tools.
- "Expected" failures (gh missing, not a repo) return null/empty; action failures
  throw `GhError` (with `.stderr`) for callers to surface.
- JSON reads use `gh ... --json <fields>` and are parsed via `runGhJson`.

## Public API

PRs: `listPullRequests`, `getPullRequest`, `createPullRequest`, `mergePullRequest`,
`checkoutPullRequest`. Issues: `listIssues`, `getIssue`, `createIssue`,
`commentIssue`. CI: `getChecks`, `getRunLogs`. Repo: `getGhStatus`, `getRepoInfo`.

## Consumers

- `apps/server/src/services/github-service.ts` — resolves cwd, caches availability.
- `apps/server/src/routes/github.ts` — HTTP for the web UI.
- `apps/server/src/services/github-tool.ts` — agent ToolDefinitions (gated by approval).
- `apps/web/src/features/github/` — web data layer + UI.

Branch push before opening a PR is done by `gitPushSetUpstream` in `@lamda/git`,
not here (keeps git/github concerns separate).
