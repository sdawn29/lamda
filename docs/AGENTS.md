# AGENTS.md — docs

> Auto-generated context for coding agents. Last updated: 2026-05-04

## Purpose

Human-facing documentation directory containing user guides, API references, architecture decisions, and setup instructions. These files are for end users, not coding agents.

## Quick Reference

| Action           | Command     |
| ---------------- | ----------- |
| View locally     | Serve docs/ via any static file server |
| Edit             | Standard markdown editing |

## File Inventory

| File | Purpose |
|------|---------|
| `index.md` | Documentation home page |
| `getting-started.md` | Initial setup and first-run guide |
| `architecture.md` | System architecture overview |
| `api.md` | REST API reference |
| `providers.md` | AI provider configuration guide |
| `settings.md` | Settings reference |
| `cli.md` | Command-line interface |
| `contributing.md` | Developer contribution guidelines |

## Relationship to AGENTS.md

These human-facing docs should be kept in sync with agent-facing AGENTS.md files:

| Human Doc | Related AGENTS.md |
|-----------|-------------------|
| `architecture.md` | Root `AGENTS.md`, `apps/server/src/routes/AGENTS.md` |
| `api.md` | `apps/server/src/routes/AGENTS.md` |
| `providers.md` | `apps/web/src/features/settings/AGENTS.md` |
| `contributing.md` | Various `AGENTS.md` files |

## Agent Convention

When updating human-facing docs:
1. Update the relevant `AGENTS.md` first (or simultaneously)
2. Ensure terminology matches between human and agent docs
3. Don't duplicate API details — link to `AGENTS.md` files instead
4. Human docs should explain _why_; AGENTS.md files explain _how_
