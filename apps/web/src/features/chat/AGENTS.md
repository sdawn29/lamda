# AGENTS.md — web/src/features/chat

> Auto-generated context for coding agents. Last updated: 2026-04-28

## Purpose

Chat feature module — implements the core messaging interface, real-time streaming from Pi agent sessions, message persistence, error handling, and UI components for the lamda application.

## Overview

The chat module is the largest feature in the web app (34 files, ~5000 lines of code). It manages:

1. **Session streaming** via SSE from the Hono server
2. **Message lifecycle** — user prompts → agent responses → tool execution → database persistence
3. **Real-time updates** — streaming text deltas, tool outputs, thinking blocks, context usage
4. **State synchronization** — TanStack Query in-memory cache (server SQLite is the source of truth; no client-side message persistence)
5. **UI rendering** — markdown, syntax highlighting, tool calls, thinking visibility, error recovery

## Architecture

```
┌─ use-chat-stream.ts (public API)
│  └─ Combines useSessionStream + useVisibleMessages
│
├─ Streaming Layer
│  ├─ use-session-stream.ts — SSE connection, event parsing, message state
│  ├─ use-visible-messages.ts — TanStack Query wrapper for message list
│  └─ session-events.ts — Event type definitions (agent_start, message_delta, tool_execute, etc.)
│
├─ UI Components Layer
│  ├─ ChatView.tsx — Main chat container, message list, input box, error dialogs
│  ├─ MessageRow.tsx — Single message renderer (user/assistant/tool/error)
│  ├─ ChatTextbox.tsx — Input field, slash commands, model/thinking selectors
│  ├─ ToolCallBlock.tsx — Tool execution display (args, result, duration, status)
│  ├─ ThinkingBlock.tsx — Expandable thinking output
│  ├─ ContextChart.tsx — Context usage visualization (costs, token counts)
│  └─ supporting components (MarkdownComponents, SyntaxHighlighter, etc.)
│
├─ Data Management
│  ├─ types.ts — Message types (User, Assistant, Tool, Error, Abort)
│  ├─ api.ts — HTTP client (prompts, title generation, model list)
│  ├─ queries.ts — TanStack Query hooks (useMessages, useSessionStats, etc.)
│  ├─ mutations.ts — TanStack Mutation hooks (useSendPrompt, useAbortSession)
│  └─ scroll-meta-store.ts — per-thread scroll position persistence (threadId-keyed)
│
└─ Context & Utilities
   ├─ error-toast-context.tsx — Error toast dispatcher
   ├─ thread-status-context.tsx — Thread running/stopped status
   ├─ hooks/ — use-session-stream, use-visible-messages, use-chat-scroll, etc.
   └─ api.ts — Server communication (SSE, prompts, models)
```

## Key Files

### Core Hooks

- **`use-chat-stream.ts`** — Main public API; orchestrates SSE, message fetching, error state
  - Returns: `visibleMessages`, `isLoading`, `isStopped`, `startUserPrompt()`, `markStopped()`
  - Wraps: `useSessionStream` + `useVisibleMessages`
- **`hooks/use-session-stream.ts`** (583 lines)
  - Opens SSE connection via `openSessionEventSource()`
  - Parses agent events (start, message_delta, tool_execute, agent_end)
  - Maintains two message buffers: `messages[]` for raw events, `visibleMessages[]` for UI rendering
  - Tool call deduplication: incoming `toolCallId`s are upserted (running → done)
  - Thinking block tracking per message
  - Error recovery with pending error state
- **`hooks/use-visible-messages.ts`**
  - TanStack Query wrapper around `/session/:id/messages` endpoint
  - Caches persisted message blocks from database
  - Merges with streaming messages from SSE
  - Pagination support
- **`hooks/use-chat-scroll.ts`**
  - Owns all transcript scroll behavior: stick-to-bottom while streaming,
    per-thread position restore, debounced persistence to `scroll-meta-store`,
    auto-loading older history near the top
  - Detects user scroll-up to prevent "jumping to bottom"

### Components

- **`components/chat-view.tsx`** (445 lines) — Main chat panel
  - Message list with virtualization via `MessageRow`
  - Keyboard shortcuts (Cmd+K for commands, Cmd+Shift+S for search, etc.)
  - Error dialogs with retry/dismiss actions
  - Status indicators (loading, compacting, thinking)
- **`components/chat-textbox.tsx`** — Input field
  - Multi-line input with textarea
  - Slash command menu (`/search`, `/file`, `/terminal`)
  - File mention dropdown (@mention syntax)
  - Model/thinking level selectors
- **`components/message-row.tsx`** — Message renderer
  - Dispatches to: `UserMessage`, `MessageBlock`, `ToolCallBlock`, `ThinkingBlock`, `ErrorMessage`
  - Markdown rendering via `react-markdown` + `remark-gfm`
  - Syntax highlighting via `react-syntax-highlighter`
- **`components/tool-call-block.tsx`** — Tool execution display
  - Collapsible UI with args → result flow
  - Duration and status badges
  - Edit tools (file editor) auto-expand; others collapsed by default
  - Loading spinner during tool execution
- **`components/thinking-block.tsx`** — Thinking output
  - Expandable by default if user preference enables it
  - Styled as secondary panel
  - Toggle visibility via `/thinking` setting in settings
- **`components/context-chart.tsx`** — Context usage visualization
  - Displays token counts, costs, input/output ratio
  - Updates via `useContextUsage()` query

### Data & Types

- **`types.ts`** — Core message type definitions
  - `UserMessage` — `{role: "user", content}`
  - `AssistantMessage` — `{role: "assistant", content, thinking, model, provider, thinkingLevel, responseTime}`
  - `ToolMessage` — `{role: "tool", toolCallId, toolName, args, status, result, duration}`
  - `ErrorMessage` — `{role: "error", title, message, retryable, action}`
  - `AbortMessage` — `{role: "abort", id}`
  - Conversion function: `blockToMessage()` transforms database `MessageBlock` to UI `Message`

- **`session-events.ts`** — SSE event type definitions
  - `agent_start`, `message_start`, `message_delta`, `message_end`
  - `tool_execution_start`, `tool_execution_update`, `tool_execution_end`
  - `agent_end`, `turn_start`, `turn_end`
  - `auto_retry_start`, `auto_retry_end`
  - `queue_update` (for steering/follow-up message queues)
  - `subscribeToSessionEvents()` — Event subscription helper

- **`queries.ts`** — TanStack Query hooks
  - `useSessionStats()` — Token counts, costs, model info
  - `useContextUsage()` — Remaining context window
  - `useMessages()` — Message list from DB
  - `useThinkingLevels()` — Available thinking modes
  - `useModels()` — Available LLM models
  - `useSlashCommands()` — Available slash commands
  - `chatKeys` — Query key factory

- **`mutations.ts`** — TanStack Mutations
  - `useSendPrompt()` — POST prompt + optional images, returns void (async fire-and-forget)
  - `useAbortSession()` — Abort current agent operation
  - `useGenerateTitle()` — Generate thread title from first message
  - `useCompactContext()` — Trigger context compaction

- **`api.ts`** — Server HTTP client
  - `openSessionEventSource(sessionId)` — Returns EventSource for SSE stream
  - `listRunningTools(sessionId)` — Get tools currently executing (for state restoration)
  - Other endpoints via shared client

### Contexts & Utilities

- **`context/error-toast-context.tsx`** — Error notification system
  - `ErrorToastProvider` — wraps app
  - `useErrorToast()` — `{ toast(title, message, options) }`
- **`thread-status-context.tsx`** — Thread running/stopped state
  - `ThreadStatusProvider` — Global context for all threads
  - `useThreadStatus()` — Current thread status
  - `useSetThreadStatus()` — Update status (used by server to track thread state)
  - `useGlobalThreadStatusWatcher()` — Watches for status changes across all threads

### Persistence

- **Messages are not persisted client-side.** The server's SQLite is the source
  of truth; transcripts live only in the TanStack Query in-memory cache.
  `usePrefetchThreadsMessages` warms that cache for all threads at startup so
  thread switches render instantly.
- **`scroll-meta-store.ts`** — per-thread scroll positions (the one piece of
  chat state that must outlive the process)
  - Keyed by **threadId** (durable) — sessionIds rotate on every server start
  - `saveScrollMeta(threadId, meta)` / `loadScrollMeta(threadId)`
  - Single zustand persist store under `lamda:scroll-meta`; also clears the
    legacy `lamda:chat:*` cache keys on load

## Conventions

- **Message immutability** — all messages in state are created via factory functions (`createAssistantMessage`, `createErrorMessage`)
- **SSE as single source of truth** — streaming messages are the primary data flow; DB is secondary (for persistence)
- **Optimistic updates** — UI updates immediately on prompt; actual agent response follows via SSE
- **Tool call deduplication** — same `toolCallId` updates existing message (running → done transition)
- **Error recovery** — pending error state can be retried or dismissed
- **Lazy component loading** — heavy components (ToolCallBlock, ThinkingBlock) render inline but are wrapped in Suspense at parent level
- **Streaming text accumulation** — `text_delta` events are concatenated, only final message flushed to DB at `agent_end`
- **Thinking visibility preference** — controlled via global setting (`useShowThinkingSetting()`)
- **Model/thinking level persistence** — stored in thread metadata (DB), not in messages

## Dependencies

- `@tanstack/react-query` — State management for messages and server queries
- `react-markdown` + `remark-gfm` — Markdown rendering
- `react-syntax-highlighter` — Code block syntax highlighting
- `lucide-react` — Icons
- `@xterm/xterm` + `@xterm/addon-fit` — Terminal for execution context
- `react-resizable-panels` — Panel layout (not directly used in chat, but co-located)

## Gotchas

- **SSE connection is per-session** — opening a new session creates a new SSE stream; old streams should be closed (handled in `useSessionStream` cleanup)
- **Message ordering** — streamed messages arrive in order but DB persistence is async; use `blockIndex` from DB blocks to maintain order
- **Tool call args/results are JSON stringified** in DB (`MessageBlock`) — converted back in `blockToMessage()`
- **Thinking blocks are optional** — `AssistantMessage.thinking` can be empty string; render only if non-empty
- **Error messages are ephemeral** — not persisted to DB; only shown in UI; cleared on scroll or retry
- **Abort messages don't have visible UI** — stored in DB but not rendered; act as logical markers
- **Context compaction** — `useCompactContext()` call blocks until complete; don't spam it
- **Slash commands are dynamic** — fetched per session; some may not be available depending on agent config
- **File mentions** — parsed from input text via regex `/(@)([\w-]+)(\d+)?/g`; not validated until sent
- **Tool execution status can be "running" indefinitely** — if tool hangs, it stays running; no timeout in UI
- **Thinking level "auto"** — means server picks based on model capability; actual level stored in response
- **Model switching mid-conversation** — updates thread metadata but doesn't re-run previous turns

## Related

- [apps/web](../../AGENTS.md) — Parent web app; contains routing, layouts, other features
- [apps/server/src/routes/AGENTS.md](../../../../apps/server/src/routes/AGENTS.md) — `/session/:id/events` and `/session/:id/prompt` endpoints
- [packages/pi-sdk](../../../../packages/pi-sdk/AGENTS.md) — Underlying agent SDK; session event types originate here
