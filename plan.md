# Review: `apps/web` — perf, dedup, compiler hygiene

## Context

The web app is a React 19 + Vite + TanStack Router SPA with `babel-plugin-react-compiler` enabled. The user reports thread switching feels sluggish (should be "native"), and asks for general simplification + reusable component extraction.

After reading the code, the slowness is mostly self-inflicted: there's a solid prefetch + localStorage + TanStack Query stack already in place, but a single `invalidateQueries` call defeats it on every switch. Compiler hygiene is mostly fine, but a handful of `eslint-disable react-hooks/exhaustive-deps` cause silent bailouts. UI duplication is real but localized — three patterns (icon-button-with-tooltip, expand/collapse, loader spinner) account for most of it.

Outcome: instant thread switching, fewer lines of UI boilerplate, fewer manual memos, and lint-time visibility into compiler bailouts.

---

## P0 — Thread-switching performance (the biggest user-visible win)

### 1. Stop invalidating messages on every thread switch

**File:** `apps/web/src/routes/workspace.$threadId.tsx:82-86`

```ts
useEffect(() => {
  if (foundThread?.sessionId) {
    queryClient.invalidateQueries({ queryKey: chatKeys.messages(foundThread.sessionId) })
  }
}, [threadId, foundThread?.sessionId, queryClient])
```

This forces a network refetch on every switch even though:
- `useMessages` (`features/chat/queries.ts:50`) already has `initialData` from localStorage, `staleTime: 30min`, `refetchOnMount: false`.
- `usePrefetchThreadsMessages` (`__root.tsx:31`) already keeps every thread warm in the background.

**Fix:** delete the effect entirely. The SSE stream (`use-session-stream.ts`) keeps the active thread fresh; the prefetch hook keeps inactive ones warm. If a "ensure latest on switch" guarantee is desired, replace with a non-blocking `prefetchQuery` (no `invalidate`).

### 2. Stop unmounting `DiffPanel` / `TerminalPanel` / `FileTree` per thread

**File:** `apps/web/src/routes/workspace.$threadId.tsx:98-180`

These are mounted *inside* the per-thread route component, so each thread switch tears them down and remounts them — DiffPanel re-runs every git query, TerminalPanel re-initializes xterm, FileTree refetches the directory listing.

**Fix options (pick one):**
- **Cheapest:** hoist the three panels into `__root.tsx` (or a layout route), pass the active `sessionId`/`workspacePath` as props. They keep their identity across thread switches; their internal queries change keys when the session changes, but the component stays mounted (xterm doesn't reinit, react-resizable doesn't re-measure).
- **Alternative:** keep where they are but add a stable layout component that uses `key={"diff"}` / `key={"terminal"}` and pulls `sessionId` from a context/store rather than props passed through the conditional render tree. The current conditional rendering (`{diffOpen && ...}`) is fine; the issue is the route boundary.

### 3. Drop the loading-state thrash on `sessionId` change

**File:** `apps/web/src/features/chat/use-chat-stream.ts:74-78`

```ts
useEffect(() => {
  startTransition(() => { setIsLoadingInternal(false) })
}, [sessionId])
```

This fires after the new ChatView renders, causing an extra render. Replace with a derived value pattern: track `loadingForSessionId` in state and gate `isLoading` to `loadingForSessionId === sessionId` — no effect, no extra render on switch.

### 4. Verify SSE handoff isn't blocking the paint

**File:** `apps/web/src/features/chat/hooks/use-session-stream.ts:276-282`

`openSessionEventSource` is awaited inside `useEffect`. The promise resolution is fine, but `EventSource` construction happens immediately on render. Confirm that the previous EventSource is closed *before* opening the new one (currently the cleanup runs in the return of the prior effect — order is correct, but worth a quick trace to ensure no double-open during rapid clicks).

### 5. (Optional, P0.5) Virtualize the message list

**File:** `apps/web/src/features/chat/components/chat-view.tsx:428-447`

Naive `chatMessages.map(...)`. With long threads (100+ messages, each containing thinking blocks + tool calls), this is the dominant render cost on mount.

**Fix:** introduce `@tanstack/react-virtual` (already a TanStack stack, no new vendor). Estimated effort: 1 day. Defer if perf after P0.1–P0.4 already feels native — measure first.

---

## P1 — React Compiler hygiene

### 1. Add `eslint-plugin-react-compiler`

**File:** `apps/web/eslint.config.js`

Currently only `eslint-plugin-react-hooks` is wired in. The compiler runs silently — bailouts produce no diagnostic. Adding `eslint-plugin-react-compiler` (recommended config) surfaces unsupported patterns at lint time.

### 2. Fix the three `eslint-disable react-hooks/exhaustive-deps`

Each one likely causes the surrounding component to bail out of compilation:

- `apps/web/src/routes/workspace.$threadId.tsx:77` — wrap `updateLastAccessed` and `setThreadStatus` in `useEffectEvent` (React 19) or include in deps.
- `apps/web/src/shared/components/keyboard-shortcuts-provider.tsx:112-113` — `JSON.stringify(shortcuts)` hack. Stabilize `shortcuts` at the source by storing it as a ref-backed value or a stable map; the compiler cannot reason through the stringify.
- `apps/web/src/features/terminal/components/terminal-panel.tsx:194` — split the effect: a stable initialization effect with proper deps + a separate `cwd`-watching effect that only re-runs when `cwd` changes.

### 3. Remove manual memos the compiler now handles

**File:** `apps/web/src/features/chat/components/chat-view.tsx`

- Line 85 — `useMemo` splitting errors from messages (trivial filter).
- Line 98 — `useMemo` for `Set` of error ids.
- Line 144 — `useMemo` for `Map` from `commandsData`.

Drop them; the compiler memoizes these. Same audit for `memo()` wrappers — keep `chat-textbox.tsx:58`, `file-changes-card.tsx:108`, `file-accordion-item.tsx:11` (used in lists / large prop surfaces). Drop trivial wrappers like `thinking-block.tsx:3`.

**Keep:** context provider `useMemo`s (`features/terminal/context.tsx:102`, `features/git/context.tsx:252`, `shared/components/theme-provider.tsx:126`). The compiler does not auto-memoize context values.

### 4. Fix derived-state-via-effect

**File:** `apps/web/src/features/settings/components/settings-page.tsx:1268-1273`

`useState(persistedValue)` + `useEffect(() => setLocalSettings(persistedValue), [persistedValue])` causes a double render on every change. Either initialize once and use an explicit "reset" action, or compute it inline.

---

## P2 — Reusable components / dedup

Each item below replaces 3+ existing copies. Land them as small, isolated PRs.

### 1. `LoadingSpinner` — replaces 26+ inline `<Loader2 className="... animate-spin" />`

Create `apps/web/src/shared/ui/loading-spinner.tsx` with `size` and `tone` variants via `cva`. Sweep call sites starting with `features/git/components/file-accordion-item.tsx:157`, `features/chat/components/file-changes-card.tsx:147`, `features/git/components/stash-entry-row.tsx:81`.

### 2. `IconButtonWithTooltip` — replaces ~10 boilerplate clusters

Create `apps/web/src/shared/ui/icon-button-with-tooltip.tsx`:

```tsx
<IconButtonWithTooltip
  icon={Trash2Icon}
  label="Drop stash"
  onClick={handleDrop}
  variant="destructive"
  disabled={dropping}
/>
```

Replaces 8-15-line clusters in `features/git/components/file-accordion-item.tsx:103-151`, `features/git/components/stash-entry-row.tsx:84-133`, etc.

### 3. `useExpandable` hook + `<Expandable>` wrapper

Create `apps/web/src/shared/hooks/use-expandable.ts` (state, keyboard handling) and a thin `<Expandable>` component that handles the chevron animation. Replaces:

- `features/chat/components/tool-call-block.tsx:202-207, 246`
- `features/chat/components/file-changes-card.tsx:114, 166, 172`
- `features/git/components/file-accordion-item.tsx:24, 76`
- `features/git/components/commit-dialog.tsx:95, 111`

### 4. Single `CopyButton` everywhere

Already exists at `apps/web/src/shared/components/copy-button.tsx`. Delete the local reimplementations in `features/chat/components/markdown-components.tsx:11-32` and the inline handler in `features/chat/components/tool-call-block.tsx:210-217`.

### 5. Shared formatters

Create `apps/web/src/shared/lib/formatters.ts` and move:
- `formatTime` from `features/chat/components/message-row.tsx:55-62`
- `formatDuration` from `features/chat/components/tool-call-block.tsx:30-34`

### 6. (Optional) Tailwind class consolidation

Recurring classes like `"h-3 w-3 shrink-0"`, `"text-muted-foreground/60"`, `"rounded-lg border border-border"` are everywhere. Fold them into the new shared components above rather than introducing a new `cva` layer just for utility-class deduplication.

---

## P3 — Large component splits (deferred / optional)

Don't do these in the same PRs as P0–P2. Track separately:

- `chat-view.tsx` (500 lines) → extract `<ChatViewHeader>`, `<ChatMessageList>`, `<ChatErrorDialog>`.
- `chat-textbox.tsx` (481 lines) → split into `<ChatInput>` core + `<ChatInputToolbar>` (model/branch/thinking selectors).
- `rich-input.tsx` (487 lines) → extract `MentionAutocomplete`, `SlashCommandAutocomplete`.

---

## Critical files

**Must modify (P0):**
- `apps/web/src/routes/workspace.$threadId.tsx` — remove invalidate, hoist heavy panels.
- `apps/web/src/routes/__root.tsx` — receive hoisted panels.
- `apps/web/src/features/chat/use-chat-stream.ts` — kill loading-reset effect.

**Modify (P1):**
- `apps/web/eslint.config.js` — add compiler plugin.
- `apps/web/src/shared/components/keyboard-shortcuts-provider.tsx` — drop `JSON.stringify` hack.
- `apps/web/src/features/terminal/components/terminal-panel.tsx` — split effects.
- `apps/web/src/features/chat/components/chat-view.tsx` — drop manual memos.
- `apps/web/src/features/settings/components/settings-page.tsx` — fix derived-state effect.

**New shared modules (P2):**
- `apps/web/src/shared/ui/loading-spinner.tsx`
- `apps/web/src/shared/ui/icon-button-with-tooltip.tsx`
- `apps/web/src/shared/hooks/use-expandable.ts`
- `apps/web/src/shared/lib/formatters.ts`

---

## Verification

For each phase, manual + tooling checks:

**P0 (perf):**
1. `npm run dev -w web` and open the Electron shell with ≥3 threads of varying length.
2. Open React DevTools Profiler. Click between threads — confirm no `<DiffPanel>` / `<TerminalPanel>` / `<FileTree>` unmount records.
3. Network tab: confirm no `/session/:id/messages` request fires on subsequent switches to a thread that's already been visited.
4. Visually: thread switch should be < 1 frame for cached threads.

**P1 (compiler):**
1. `npm run lint -w web` — must pass clean (no new errors after adding `eslint-plugin-react-compiler`).
2. `npm run check-types -w web` — clean.
3. Spot-check React DevTools: components in `chat-view.tsx` should show "Memo" (compiler) badges with no manual `useMemo`.

**P2 (dedup):**
1. `npm run build -w web` — bundle should not grow (likely shrinks slightly).
2. Visual regression pass on: chat list, tool call blocks, git file accordion, stash list, commit dialog, file changes card.
3. Keyboard interaction: Enter/Space still toggle expandable rows.

**Cross-cutting:**
- `npm run check-types && npm run lint` at workspace root.
- Smoke test: send a prompt, see streaming render, switch threads mid-stream, return — UI state and scroll position preserved.
