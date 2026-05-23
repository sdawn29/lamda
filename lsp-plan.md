# LSP support for the file viewer and workspace

## Context

The file viewer today (`apps/web/src/features/main-tabs/components/file-content-view.tsx` and the embedded `FileContent` inside `apps/web/src/features/git/components/diff-panel.tsx`) is a read-only Prism-based viewer with extension→language detection but no semantic information. The agent likewise has only filesystem/grep tools — no type or definition awareness.

We want to add Language Server Protocol support so that:

1. **The file viewer** surfaces diagnostics (squiggles), hover (types/docs), go-to-definition / references, and a document symbols outline — overlaid on the existing Prism viewer (no editor swap).
2. **The agent** can call LSP-derived tools (`lsp_hover`, `lsp_definition`, `lsp_references`, `lsp_document_symbols`, `lsp_diagnostics`) via the existing `setCustomTools` mechanism.
3. Language servers are looked up on the user's `PATH` (system-installed). Missing servers degrade silently — the viewer still works, just without semantic overlays.

The existing MCP service (per-workspace pool of stdio child processes, plus tool conversion to `ToolDefinition[]` for pi-sdk) is the right shape to mirror.

## Architecture

```
Client (apps/web)                   Server (apps/server)                    Child processes
─────────────────                   ────────────────────                    ───────────────
file-content-view ─┐                                                       ┌── tsserver
                   ├─ WS /ws/workspace/:wsId/lsp ─┬─ lsp-router ─┬─────────┤── pyright
LSP hooks ─────────┘                              │              │         └── gopls / rust-analyzer
                                                  └─ session-service
                                                      │   gets tools from
                                                      └─► language-service ◄── child_process.spawn

                                                      ► getLspToolsForSession(wsId)
```

One language server per (workspaceId, language). Spawned lazily on first `didOpen` for that language. Idle-pruned alongside the workspace.

## Implementation

### 1. New package: `@lamda/lsp` (`packages/lsp/`)

Mirror `packages/mcp/` structure. Encapsulates LSP transport + lifecycle.

Dependencies (root `package.json`):
- `vscode-jsonrpc` — JSON-RPC framing
- `vscode-languageserver-protocol` — LSP types

Files:
- `src/types.ts` — `LspServerConfig`, `LspClient` interface, language registry types
- `src/client.ts` — `LspClient` wrapping `createMessageConnection(reader, writer)` over a spawned child process's stdio. Handles `initialize` (with `rootUri = file://${workspacePath}`), `initialized`, `shutdown`, `exit`. Tracks open documents and version numbers. Forwards `publishDiagnostics` to a subscriber callback.
- `src/registry.ts` — Hardcoded language registry: extension → `{ language, command, args }`. Defaults: `ts/tsx/js/jsx → typescript-language-server --stdio`, `py → pyright-langserver --stdio` (fallback `pylsp`), `rs → rust-analyzer`, `go → gopls`. Use `node:child_process.execFile("which", ...)` (or `where` on win32) to detect availability before spawn.
- `src/converter.ts` — Convert LSP capabilities to pi-sdk `ToolDefinition`s (parallels `mcpToolToPiTool` in `packages/mcp/src/converter.ts`).
- `src/index.ts` — Barrel export.

### 2. Server service: `apps/server/src/services/language-service.ts`

Mirror `apps/server/src/services/mcp-service.ts`:

- **Per-workspace pool**: `Map<workspaceId, Map<language, LspEntry>>` where `LspEntry = { client, lang, workspacePath, openDocs: Set<uri>, diagnostics: Map<uri, Diagnostic[]>, diagnosticsSubscribers: Set<(uri, diags) => void> }`.
- `ensureServer(workspaceId, workspacePath, language)` — lazy spawn; on first call for a language, locate the binary (via `@lamda/lsp` registry), spawn, `initialize`, attach `publishDiagnostics` handler that fans out to subscribers and caches the latest diagnostics per URI.
- `openDocument(workspaceId, workspacePath, filePath, content)` — picks the language from extension, calls `ensureServer`, sends `textDocument/didOpen`, marks open.
- `closeDocument(workspaceId, filePath)` — `textDocument/didClose`, drop diagnostic cache for the URI.
- `request(workspaceId, filePath, method, params)` — generic typed forwarder used by both the WS bridge and the agent tools.
- `subscribeDiagnostics(workspaceId, cb)` / `unsubscribe(...)` — fan-out to WS clients.
- `getLspToolsForSession(workspaceId, workspacePath)` — returns `ToolDefinition[]` for `lsp_hover`, `lsp_definition`, `lsp_references`, `lsp_document_symbols`, `lsp_diagnostics`. Each tool's executor opens the document if not already open, then forwards to the right server.
- **Lifecycle**: 15-minute idle sweep (like MCP) and shutdown hook called from `workspaceIndexer.stopIndexing` to send `shutdown` + `exit` to all servers in that workspace and kill the children.
- **Graceful degradation**: if no server is available for the language, return `null` / empty results from the service layer; never throw out to callers.

### 3. WebSocket route: `apps/server/src/routes/lsp.ts`

New file mirroring `apps/server/src/routes/sessions.ts`. Exports `handleLspWs(ws, workspaceId)`:

- Client→server message envelope: `{ id, method, params, filePath, content? }`. For `didOpen` the client sends the file's content (server cannot read unsaved buffers, and content is already loaded client-side); server delegates to `language-service.openDocument`. For all other methods, server calls `language-service.request`.
- Server→client messages: responses keyed by `id`, plus pushed `{ type: "diagnostics", uri, diagnostics }` notifications driven by `subscribeDiagnostics`.
- On WS close: `closeDocument` for any documents this client opened and unsubscribe.

Wire it up in `apps/server/src/index.ts`:
- Extend `isKnownWsPath` with `/^\/ws\/workspace\/[^/]+\/lsp$/`.
- Add the corresponding branch in the `wss.on("connection", ...)` handler.

### 4. Session tool wiring

Edit `apps/server/src/services/session-service.ts:26` to merge LSP tools with MCP tools:

```ts
const [mcpTools, lspTools] = await Promise.all([
  workspaceId ? import("./mcp-service.js").then(m => m.getMcpToolsForSession(workspaceId)) : Promise.resolve([]),
  workspaceId && workspacePath ? import("./language-service.js").then(m => m.getLspToolsForSession(workspaceId, workspacePath)) : Promise.resolve([]),
])
const customTools = [...mcpTools, ...lspTools]
```

Same merge inside `apps/server/src/routes/mcp.ts:23-25` (where tools are refreshed when settings change) and any other call sites returned by `grep -n setCustomTools`.

### 5. Client-side: `apps/web/src/features/lsp/`

New feature folder:

- `client.ts` — `LspConnection` class: opens `WebSocket(${serverUrl}/ws/workspace/${wsId}/lsp)`, correlates requests by id, exposes typed methods (`didOpen`, `didClose`, `hover`, `definition`, `references`, `documentSymbol`). Surfaces a `diagnostics$` stream (simple `EventTarget`).
- `hooks.ts`:
  - `useLspConnection(workspaceId)` — lazy singleton per workspaceId via Zustand or context.
  - `useFileDiagnostics(workspaceId, filePath)` — subscribes to diagnostics for the URI.
  - `useHover(workspaceId, filePath, position)` — request on demand.
  - `useDocumentSymbols(workspaceId, filePath)` — request on file open.

### 6. Viewer overlays: `apps/web/src/features/main-tabs/components/file-content-view.tsx`

On mount (non-image, non-pdf, after content loads):
- Call `useLspConnection(workspaceId).didOpen(filePath, content, language)`. On unmount, `didClose`.
- Subscribe to diagnostics via `useFileDiagnostics`.

Three new pieces of UI:

**a) Problems strip** — a thin row inside the `FileHeader` (`apps/web/src/features/git/components/file-header.tsx`) showing `N errors, M warnings`, click-to-expand into a popover list with `Line N: message`. Click a row → scroll to that line.

**b) Inline diagnostic markers** — Prism's `react-syntax-highlighter` accepts a `renderer` prop. Override it to wrap each line with a `data-line` attribute and, when that line has diagnostics, add a red/yellow left border and a tooltip. Also extend `prism-code.tsx` to accept an optional `lineDecorations: Map<number, { severity, message }[]>` prop — keep the change small and additive.

**c) Document symbols outline** — Add a collapsible "Outline" disclosure in `FileHeader` (or a small floating panel at the top of the viewer body) listing the symbol tree from `textDocument/documentSymbol`. Click → scroll to range.

**Hover and go-to-def (single shared mechanism):**
- Render an invisible overlay `<div>` absolutely positioned over the Prism code area. On `pointermove`, use `document.caretPositionFromPoint`/`caretRangeFromPoint` to find the DOM text node + offset, then map back to `(line, character)` by walking the rendered structure (each line wrapper gives the line; character is offset within the rendered line text).
- Debounced `hover` request → tooltip with the Markdown contents.
- Cmd/Ctrl-click → `definition` request → if the resulting URI is the current file, scroll; if another file, call `onOpenFile(targetPath, fileName)` (already a prop on `FileContentView`). Same flow for `git/components/diff-panel.tsx`'s `FileContent`.

(Caret-from-point is well-supported in Chromium/Electron and is the smallest path to position mapping without rewriting the viewer.)

### 7. Workspace lifecycle hook

In `apps/server/src/services/workspace-indexer.ts:88` (`stopIndexing`), call `languageService.shutdownWorkspace(workspaceId)` so language servers don't outlive the workspace. No new schema or DB changes for this iteration.

## Files to modify / create

**Create**
- `packages/lsp/{package.json, tsconfig.json, src/{client,registry,converter,types,index}.ts}`
- `apps/server/src/services/language-service.ts`
- `apps/server/src/routes/lsp.ts`
- `apps/web/src/features/lsp/{client.ts, hooks.ts, types.ts}`

**Modify**
- `package.json` (root) — add `vscode-jsonrpc`, `vscode-languageserver-protocol` to relevant workspaces
- `apps/server/package.json` — depend on `@lamda/lsp`
- `apps/server/src/index.ts` — register `/ws/workspace/:wsId/lsp` route
- `apps/server/src/services/session-service.ts:26` — merge LSP tools
- `apps/server/src/routes/mcp.ts:23-25` — also refresh LSP tools on tool-set changes
- `apps/server/src/services/workspace-indexer.ts:88` — shutdown LSP on idle/stop
- `apps/web/src/features/main-tabs/components/file-content-view.tsx` — open/close docs, render overlays
- `apps/web/src/features/chat/components/prism-code.tsx` — accept optional `lineDecorations` + renderer wrapper
- `apps/web/src/features/git/components/file-header.tsx` — problems strip + outline disclosure
- `apps/web/src/features/git/components/diff-panel.tsx` (`FileContent`, ~lines 728-998) — same overlays as `file-content-view.tsx`

## Reused existing utilities

- `getServerUrl()` (`apps/web/src/shared/lib/client.ts`) — for the WS URL.
- `LANGUAGE_MAP` already declared in both `file-content-view.tsx:26-42` and `diff-panel.tsx:95-111` — promote to `apps/web/src/shared/lib/language-map.ts` and reuse for LSP language id selection.
- `mcpToolToPiTool` (`packages/mcp/src/converter.ts`) — pattern to copy for LSP tool conversion.
- Workspace ID is already threaded into `FileMainTab` via `workspacePath` (see `apps/web/src/features/main-tabs/store.ts:addFileTab`). The LSP hook will resolve `workspaceId` from the active workspace store.

## Out of scope (follow-ups)

- Editing in the viewer (Monaco/CodeMirror swap).
- Configurable per-workspace LSP server settings UI + DB table.
- Completions, formatting, rename, code actions.
- Bundling language server binaries.

## Verification

1. **Manual, happy path** (with `typescript-language-server` installed via `npm i -g typescript-language-server typescript`):
   - `npm run dev` → open the app in a workspace containing a TS file with an intentional type error.
   - Open the file in a tab — red squiggle on the bad line within ~1s; hover shows the error.
   - Hover any identifier — tooltip with the type info.
   - Cmd-click an imported symbol → opens the defining file in a new tab at the right line.
   - "Outline" disclosure in the file header lists the symbols; clicking scrolls.
2. **Graceful degradation**:
   - Rename `typescript-language-server` off PATH, restart server. Open the same file — no errors thrown, viewer still highlights with Prism, no overlays appear, no console errors except a single warning.
3. **Agent tools**:
   - In a chat thread, prompt: "Use `lsp_definition` to find where `getServerUrl` is defined." The tool call should succeed and return the URI + range.
4. **Cleanup**:
   - Close the workspace / leave it idle past 30 minutes. `ps -ef | grep typescript-language-server` shows the child process exited.
5. **No regressions**:
   - `npm run check-types` and `npm run lint` clean across all workspaces.
   - Existing MCP servers in another workspace still start, list tools, and execute (the tool-merge is additive).
