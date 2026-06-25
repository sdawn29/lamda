# AGENTS.md — gitlab

> GitLab integration utility. Wraps the GitLab CLI (`glab`) plus local `git`
> commands via `child_process.execFile`.

## Purpose

Thin, typed wrapper around `glab` for repository detection, merge requests,
issues, and publishing local repositories to GitLab. Auth is delegated entirely
to `glab`; this package stores no tokens.

## Quick Reference

| Action    | Command                                |
| --------- | -------------------------------------- |
| Typecheck | `npm run check-types -w @lamda/gitlab` |

## Public API

Status: `getGlabStatus`. Repo: `getRepoInfo`, `publishRepository`. Merge
requests: `listMergeRequests`. Issues: `listIssues`.
