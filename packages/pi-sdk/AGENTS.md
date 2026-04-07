# AGENTS.md — pi-sdk

> Auto-generated context for coding agents. Last updated: 2026-04-07

## Purpose

Wrapper around `@mariozechner/pi-coding-agent` that provides managed session lifecycle, model discovery, auth resolution, and SSE-compatible event streaming for the Lambda server.

## Quick Reference

| Action    | Command                                  |
| --------- | ---------------------------------------- |
| Typecheck | `npm run check-types -w @lambda/pi-sdk` |

## Architecture

Thin abstraction layer over the Pi coding agent SDK. Key responsibilities:

- Auth resolution (config → env → file)
- Session management with in-memory storage
- Event streaming via async generator pattern
- Thread title generation via single-turn agent session

### Key Files

- `src/index.ts` — Barrel exports: `createManagedSession`, `getAvailableModels`, `generateThreadTitle`, types
- `src/session.ts` — `createManagedSession()` — main factory for agent sessions
- `src/types.ts` — TypeScript interfaces: `SdkConfig`, `ManagedSessionHandle`, `SessionEvent`, `ModelInfo`
- `src/auth.ts` — Auth storage builder with fallback chain
- `src/models.ts` — Model discovery from SDK's ModelRegistry
- `src/stream.ts` — `sessionEventGenerator()` — converts SDK's subscribe API to async generator
- `src/title.ts` — `generateThreadTitle()` — single-turn LLM call for naming threads

## Public API

| Export                                  | Type                            | Description                                                     |
| --------------------------------------- | ------------------------------- | --------------------------------------------------------------- |
| `createManagedSession(config)`          | `Promise<ManagedSessionHandle>` | Creates a full agent session with prompt/abort/dispose/events   |
| `getAvailableModels()`                  | `ModelInfo[]`                   | Returns all models registered in the SDK                        |
| `generateThreadTitle(message, config?)` | `Promise<string>`               | LLM-generated thread title from first message                   |
| `ManagedSessionHandle`                  | interface                       | Session control: `prompt()`, `abort()`, `dispose()`, `events()` |
| `SdkConfig`                             | interface                       | Configuration: `anthropicApiKey`, `cwd`, `provider`, `model`    |
| `SessionEvent`                          | union type                      | All events from the agent (SDK events + `sdk_error`)            |
| `ModelInfo`                             | interface                       | Model descriptor: `id`, `name`, `provider`                      |

## Auth Resolution

Priority order for API key:

1. `config.anthropicApiKey` (passed programmatically)
2. `ANTHROPIC_API_KEY` environment variable
3. `~/.pi/agent/auth.json` (file-based storage)

## Conventions

- **No test framework** — tests not configured
- **Source-only package** — exports point directly to `.ts` files, no build step
- **In-memory sessions** — agent sessions are not persisted to disk; only metadata is stored in the DB
- **Async generator for events** — `events()` returns a long-lived generator that spans multiple prompts

## Dependencies

- `@mariozechner/pi-coding-agent` (v0.64.0) — Core Pi coding agent SDK

## Gotchas

- **SDK version is pinned** to `0.64.0` — upgrading may break the event type mapping in `stream.ts`
- **Event generator is long-lived** — it survives across multiple `prompt()` calls; breaking out of the loop unsubscribes and cleans up
- **Title generation creates a disposable session** — each call to `generateThreadTitle` spins up and tears down its own agent session with `tools: []`
- **Node.js single-threaded guarantee** — the event queue in `stream.ts` relies on Node.js being single-threaded to avoid races between the subscribe callback and the generator
- **Fallback title** — if title generation fails, falls back to first 50 characters of the message

## Related

- [apps/server](../../apps/server/AGENTS.md) — Primary consumer of this package
- [packages/db](../db/AGENTS.md) — Database layer (sessions reference threads stored here)
