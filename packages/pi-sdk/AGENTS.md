# AGENTS.md — pi-sdk

> Auto-generated context for coding agents. Last updated: 2026-04-27

## Purpose

Wrapper around `@mariozechner/pi-coding-agent` that provides managed session lifecycle, model discovery, auth resolution, and SSE-compatible event streaming for the lamda server.

## Quick Reference

| Action    | Command                                |
| --------- | -------------------------------------- |
| Typecheck | `npm run check-types -w @lamda/pi-sdk` |

## Architecture

Thin abstraction layer over the Pi coding agent SDK. Key responsibilities:

- Auth resolution (config → env → file)
- Session management with in-memory storage
- Event streaming via async generator pattern
- Thread title generation via single-turn agent session
- Commit message generation

### Key Files

- `src/index.ts` — Barrel exports: `createManagedSession`, `openManagedSession`, `getAvailableModels`, `generateThreadTitle`, `generateCommitMessage`, types
- `src/session.ts` — `createManagedSession()` and `openManagedSession()` — main factories for agent sessions
- `src/types.ts` — TypeScript interfaces: `SdkConfig`, `ManagedSessionHandle`, `SessionEvent`, `ModelInfo`, `SlashCommand`, `ContextUsage`, `PromptOptions`, `ImageContent`
- `src/auth.ts` — Auth storage builder with fallback chain
- `src/models.ts` — Model discovery from SDK's ModelRegistry
- `src/stream.ts` — `sessionEventGenerator()` — converts SDK's subscribe API to async generator
- `src/title.ts` — `generateThreadTitle()` — single-turn LLM call for naming threads
- `src/commit-message.ts` — `generateCommitMessage()` — single-turn LLM call for generating conventional commit messages

## Public API

| Export                                  | Type                            | Description                                                     |
| --------------------------------------- | ------------------------------- | --------------------------------------------------------------- |
| `createManagedSession(config)`          | `Promise<ManagedSessionHandle>` | Creates a new session with prompt/abort/dispose/events         |
| `openManagedSession(sessionFilePath, config?)` | `Promise<ManagedSessionHandle>` | Resumes an existing session from JSONL file |
| `getAvailableModels()`                  | `ModelInfo[]`                   | Returns all models registered in the SDK                        |
| `generateThreadTitle(message, config?)` | `Promise<string>`               | LLM-generated thread title from first message                  |
| `generateCommitMessage(diff, config?)`   | `Promise<string>`               | LLM-generated conventional commit message from git diff         |
| `DEFAULT_COMMIT_PROMPT`                 | `string`                        | Default prompt template for commit message generation           |

### Interfaces

#### `ManagedSessionHandle`

```typescript
interface ManagedSessionHandle {
  prompt(text: string, options?: PromptOptions): Promise<void>;
  steer(text: string): Promise<void>;           // Queue steering message
  followUp(text: string): Promise<void>;       // Queue follow-up message
  abort(): Promise<void>;
  dispose(): void;
  setModel(provider: string, modelId: string): Promise<void>;
  setThinkingLevel(level: ThinkingLevel): void;
  events(): AsyncGenerator<SessionEvent>;
  getCommands(): SlashCommand[];
  getContextUsage(): ContextUsage | undefined;
  compact(): Promise<void>;
  getAvailableThinkingLevels(): string[];
  readonly sessionFile: string | undefined;
}
```

#### `PromptOptions`

```typescript
interface PromptOptions {
  images?: ImageContent[];
  streamingBehavior?: "steer" | "followUp";
  expandPromptTemplates?: boolean;
}
```

#### `SdkConfig`

```typescript
interface SdkConfig {
  anthropicApiKey?: string;
  cwd?: string;
  provider?: string;
  model?: string;
  thinkingLevel?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
  authStorage?: AuthStorage;
  modelRegistry?: ModelRegistry;
}
```

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
- **Session persistence via Pi SDK** — actual conversation history is saved by the Pi SDK to `~/.pi/agent/sessions/`

## Dependencies

- `@mariozechner/pi-coding-agent` (v0.70.2) — Core Pi coding agent SDK

## Gotchas

- **SDK version is pinned** to `0.70.2` — upgrading may break the event type mapping in `stream.ts`
- **Event generator is long-lived** — it survives across multiple `prompt()` calls; breaking out of the loop unsubscribes and cleans up
- **Title generation creates a disposable session** — each call to `generateThreadTitle` spins up and tears down its own agent session with `tools: []`
- **Node.js single-threaded guarantee** — the event queue in `stream.ts` relies on Node.js being single-threaded to avoid races between the subscribe callback and the generator
- **Fallback title** — if title generation fails, falls back to first 50 characters of the message
- **`steer()` vs `followUp()`** — steer interrupts immediately after tool calls finish; followUp waits until agent is idle
- **`setThinkingLevel()`** is synchronous, not async — directly updates session config
- **`compact()`** summarizes conversation history to reduce context window usage

## Related

- [apps/server](../../apps/server/AGENTS.md) — Primary consumer of this package
- [packages/db](../db/AGENTS.md) — Database layer (sessions reference threads stored here)