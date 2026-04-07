# AGENTS.md — db

> Auto-generated context for coding agents. Last updated: 2026-04-07

## Purpose

Drizzle ORM + SQLite database layer — provides schema definitions, database client initialization, and CRUD query functions for workspaces, threads, and messages.

## Quick Reference

| Action    | Command                              |
| --------- | ------------------------------------ |
| Typecheck | `npm run check-types -w @lambda/db` |

## Architecture

Single-file database client (`client.ts`) that:

1. Creates SQLite database at `~/.lambda-code/db.sqlite`
2. Enables WAL journal mode and foreign keys
3. Runs `CREATE TABLE IF NOT EXISTS` migrations inline
4. Exports a Drizzle ORM instance

### Key Files

- `src/client.ts` — Database initialization with inline schema migrations
- `src/schema.ts` — Drizzle table definitions (workspaces, threads, messages)
- `src/queries/workspaces.ts` — Workspace CRUD operations
- `src/queries/threads.ts` — Thread CRUD operations
- `src/queries/messages.ts` — Message listing and insertion
- `src/index.ts` — Barrel export of all public API

## Database Schema

| Table        | Columns                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------- |
| `workspaces` | `id` (TEXT PK), `name`, `path`, `created_at`                                                      |
| `threads`    | `id` (TEXT PK), `workspace_id` (FK → workspaces), `title`, `created_at`                           |
| `messages`   | `id` (TEXT PK), `thread_id` (FK → threads), `role` (user/assistant/tool), `content`, `created_at` |

All IDs are UUIDs. Timestamps are Unix epoch integers. Foreign keys cascade on delete.

## Conventions

- **No migrations framework** — schema is created via `CREATE TABLE IF NOT EXISTS` on client init
- **Synchronous API** — all query functions are synchronous (better-sqlite3 is sync)
- **No test framework** — tests not configured
- **Source-only package** — exports point directly to `.ts` files, no build step

## Dependencies

- `drizzle-orm` — Type-safe SQL query builder
- `better-sqlite3` — Synchronous SQLite3 bindings

## Gotchas

- **Database path is hardcoded** to `~/.lambda-code/db.sqlite` — not configurable via env var
- **No migration system** — adding a new column requires manually updating the `CREATE TABLE` statement in `client.ts` and considering backward compatibility
- **Synchronous by design** — all DB operations block the event loop; acceptable for a single-user desktop app but would need refactoring for server use
- **No connection pooling** — single SQLite connection; fine for desktop but not for concurrent access

## Related

- [apps/server](../../apps/server/AGENTS.md) — Primary consumer of this package
- [packages/pi-sdk](../pi-sdk/AGENTS.md) — Pi agent SDK (sessions reference threads stored here)
