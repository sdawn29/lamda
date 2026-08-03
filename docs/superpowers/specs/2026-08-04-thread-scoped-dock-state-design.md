# Thread-scoped dock state

## Problem

`apps/web/src/features/dock/store.ts` holds one global dock state: which panels
are open, which dock they live in, which tab is active, the dock sizes, the open
file previews, the file tree, and fullscreen. Every thread shares it. Opening the
Review panel while working on thread A leaves it open on thread B, and closing it
there closes it for A. Panel layout is per-task state, so it should follow the
thread.

## Goal

Each thread gets its own dock layout — panels, tabs, open/closed state, sizes,
open file previews, file tree, fullscreen. Switching threads restores that
thread's layout. Everything else about the dock (where a singleton panel type
lives, the inner splitter widths) stays a global user preference.

## State shape

`DockStoreState` splits into a per-scope part and a global part.

```ts
interface DockScopeState {
  docks: Record<DockId, DockZoneState>; // tabIds, activeTabId, isOpen, size
  tabs: Record<string, DockTab>;
  filePreviews: FilePreview[];
  activeFilePreviewId: string | null;
  fileTreeOpen: boolean;
  rightDockFullscreen: boolean;
}

interface DockStoreState {
  scopes: Record<string, DockScopeState>;
  activeScopeId: string;
  // global
  singletonHome: Partial<Record<string, DockId>>;
  fileTreeWidth: number;
  reviewFilesWidth: number;
  draggingTabId: string | null;
  defaultSizes: Record<DockId, number>;
  // …every existing action, unchanged in signature
  setActiveScope: (id: string | null) => void;
  dropScope: (id: string) => void;
}
```

Scope keys are thread ids. Routes with no thread (`/new`, `/automations`,
`/skills`) share one bucket under the constant `NO_THREAD_SCOPE`
(`"__no-thread__"`).

Rationale for what stays global:

- `singletonHome` — "the Review panel lives in the right dock" is a preference
  about the panel type, not about one thread's layout.
- `fileTreeWidth`, `reviewFilesWidth` — inner splitter widths within a panel,
  same reasoning.
- `draggingTabId` — transient drag state; a drag never spans a thread switch.
- `defaultSizes` — see Sizes below.

## Keying: the active scope lives in the store

`activeScopeId` is store state, not a parameter threaded through call sites. One
effect in `workspace-layout.tsx` calls `setActiveScope(threadId ?? null)` from
`useParams({ strict: false }).threadId`; `setActiveScope(null)` resolves to
`NO_THREAD_SCOPE`.

This is the deciding constraint: several entry points call the store from outside
React with no thread id available —

- `openFileTab()` / `openReviewPanel()` / `toggleReviewPanel()` (module-level
  helpers exported from the dock feature, called from chat, the command palette,
  and the file tree),
- `subagent-panel-store.ts:67`,
- `terminal/store.ts` (`revealTerminalDockTab`, `toggle`),
- `workspace/mutations.ts:275`.

A store-internal key leaves all of them working with no plumbing. Passing a
thread id into each action would require every one of these to acquire one.

Scopes are created lazily: a helper `getScope(s, id)` returns the existing scope
or a freshly-defaulted one, and reducers write it back. Reads go through
`activeScope(s)`, which returns a module-level frozen default object when the
scope does not exist yet, so Zustand's `===` equality check never sees a new
object for an unvisited thread.

## Action and selector migration

Action signatures do not change. Each reducer body changes from operating on `s`
to operating on `s.scopes[s.activeScopeId]`, returning
`{ scopes: { ...s.scopes, [id]: next } }`.

Read sites gain one wrapper call. Affected files and the reads in them:

- `features/dock/components/dock-zone.tsx` — `docks[dockId]`, `tabs`,
  `fileTreeOpen`, `rightDockFullscreen`, `docks[dockId].tabIds`
- `features/dock/panels.tsx` — `fileTreeOpen`, `filePreviews`,
  `activeFilePreviewId`
- `features/layout/components/workspace-layout.tsx` — `docks.right`,
  `docks.bottom`, `rightDockFullscreen`
- `features/layout/components/title-bar.tsx` — `docks.bottom.isOpen`,
  `docks.right.isOpen`, `rightDockFullscreen`
- `features/command-palette/components/command-palette.tsx` — `fileTreeOpen`
- `features/file-tree/components/file-tree.tsx` — active file path
- `features/chat/components/chat-composer.tsx` — `filePreviews`

`isTabVisible(state, type)` keeps its exported signature and resolves the active
scope internally, so `terminal/store.ts` needs no change.

## Sizes

Dock sizes are per-scope, but a global `defaultSizes` is persisted and seeds
every new scope. Without it, making sizes scope-local and memory-only would
regress today's behavior, where a resized dock keeps its width across a reload.

`setDockSize(dockId, size)` writes both the active scope's size and
`defaultSizes[dockId]`. A scope created for a thread the user has not visited is
born at `defaultSizes`.

## Persistence

`scopes` and `activeScopeId` are memory-only — they do not appear in
`partialize`. This matches today's behavior, where tabs and open/active state are
session-only and the docks start closed after a reload.

The persisted set becomes exactly: `defaultSizes`, `singletonHome`,
`fileTreeWidth`, `reviewFilesWidth`. The existing `merge` function is updated to
read `defaultSizes` and to accept the old persisted shape
(`docks.{right,bottom}.size`) as its source, so an existing localStorage entry
migrates without the user losing their dock widths.

## New-thread behavior

An unvisited thread starts at defaults: docks closed, no tabs, no file previews,
file tree closed, sizes from `defaultSizes`.

One exception. Composing on `/new` puts the user in `NO_THREAD_SCOPE`; sending
the first message navigates to a freshly created thread. With strict defaults,
any panel open while composing would snap shut mid-send. So: when
`setActiveScope` moves from `NO_THREAD_SCOPE` to a thread id that has no scope
yet **and** the navigation originated on `/new`, the scratch scope's state is
moved onto the new thread's key and `NO_THREAD_SCOPE` resets to defaults.

The `/new` origin is tracked in `workspace-layout.tsx` from the committed router
matches (a ref holding the previous route id), and passed to `setActiveScope` as
an explicit `{ handoff: true }` option rather than inferred inside the store. The
guard matters: navigating from `/automations` to an existing-but-unvisited thread
must not inherit the automations page's layout.

## Cleanup

- `dropScope(threadId)` on thread delete, called from `useDeleteThread` in
  `features/workspace/mutations.ts:309`. Without it the map grows for the
  session, which is bounded but pointless.
- `closeWorkspaceFileTabs(workspacePath)` keeps its signature but sweeps
  `filePreviews` across **all** scopes, not just the active one — a deleted
  workspace's files can be open in the Files panel of several threads.
- Workspace deletion (`mutations.ts:275`) additionally calls
  `dropScope(threadId)` for each thread of the deleted workspace, which the
  mutation already has in hand.

## Terminal

The terminal dock tab becomes per-thread, so switching threads unmounts the
terminal panel when the new thread has no terminal tab. This is safe: PTYs are
server-side and are torn down only on an explicit tab close
(`terminal/store.ts:5-14`), and PTY tabs are tracked per-workspace in
`useTerminalStore`, which is untouched. Returning to a thread with a terminal tab
reattaches to the live PTY, exactly as a workspace switch does today.

The `syncCwd` effect in `workspace-layout.tsx` is gated on
`isTabVisible(s, "terminal")`, which now means "visible in the active thread's
scope" — the correct reading.

## Testing

- Store-level unit tests over the reducers: opening a tab in scope A leaves scope
  B empty; `setDockSize` updates both the scope and `defaultSizes`; a fresh scope
  reads `defaultSizes`; the `/new` handoff moves state exactly once and only with
  the flag; `closeWorkspaceFileTabs` clears previews in every scope;
  `dropScope` removes only its key.
- `merge` tests: an old persisted payload (`docks.right.size`) yields the right
  `defaultSizes`; a missing/garbage payload falls back to current.
- `isTabVisible` against a state whose active scope does not exist yet.
- Verification is `npm run typecheck` and `npm run lint` in `apps/web`. The app
  is not launched.

## Out of scope

- Persisting per-thread layouts across reloads.
- Per-workspace (rather than shared) scratch scopes for thread-less routes.
- Any change to `useTerminalStore`'s workspace keying.
