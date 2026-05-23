# Make Plan Mode More Robust

## Context

Today, **plan mode** ([`packages/pi-sdk/src/modes.ts`](packages/pi-sdk/src/modes.ts)) tells the agent to investigate read-only and respond with a numbered-list plan inline in chat. That plan is just text in the message stream — once the thread scrolls, it's gone. There's no persistent artifact to review or edit, no way to share or commit it, and switching from plan → code is a manual mode-combobox click followed by retyping "now implement that plan."

Three improvements turn plan mode into a real workflow:

1. **Persist plans.** Agent saves the plan as a markdown file in `.agents/plans/` so it lives in the repo and can be reviewed/edited.
2. **Open for review.** The saved plan auto-opens in the file viewer as a focused tab so the user can immediately edit it.
3. **Auto-transition.** When the plan file is written, the thread auto-switches to `code` mode with a toast + Undo. The user's next message lands as a real coding turn.

User decisions (confirmed):
- Agent writes the file (not server-side extraction).
- Switch happens **on plan-file write**, with a toast announcing the switch and an Undo affordance.
- New plan tab is opened **focused** in the file viewer.
- `.agents/plans/` is **not** auto-added to .gitignore — plans are repo artifacts.

## Approach

### 1. Plan mode gets restricted Write access

**File:** `packages/pi-sdk/src/modes.ts`

- Add `"write"` to `plan.allowedBuiltins`.
- Export a constant: `export const PLAN_DIR = ".agents/plans"` for reuse on both sides.
- Update `plan.preamble` to:
  > Plan mode is active. Investigate the request thoroughly using read tools, then save your plan as a markdown file at `.agents/plans/<short-kebab-slug>.md` (relative to the workspace root). The slug should be 2–5 words describing the task. Use the Write tool **only** for this single plan file — do not edit or create any other files. Bash is read-only inspection (git log, ls, etc.). Once the plan file is written, stop; the user will review it.

### 2. New `plan-saved` SessionEvent

**File:** `packages/pi-sdk/src/types.ts`

- Add to the SessionEvent union:
  ```ts
  | { type: "plan-saved"; filePath: string; relativePath: string }
  ```
  `filePath` = absolute, `relativePath` = repo-relative for display.

### 3. Server detects plan write + emits the event

**File:** `apps/server/src/session-events.ts`

- In the existing tool-result handler, after a successful `write` (or `edit`-creating-a-new-file) tool call:
  - Resolve the target path against the session's `cwd`.
  - If the resolved path is under `<cwd>/.agents/plans/` and ends in `.md`, emit `plan-saved` with absolute + relative paths.
- Buffer it through `SessionEventHub` like other events so a reconnecting client receives it.

**File:** `apps/server/src/services/session-service.ts`

- On session bootstrap, `mkdir -p <cwd>/.agents/plans` so the first write never fails on a missing directory.

### 4. (Optional during impl) Hard path guard

Grep where the SDK routes Write tool calls (inside `packages/pi-sdk/`). If there's a clean interception point, reject Write in plan mode when the target falls outside `.agents/plans/`. If the SDK doesn't expose a clean hook, ship preamble-only enforcement and leave a TODO — the user already gets immediate visual feedback (stray files appear in tabs) if the agent strays.

### 5. Frontend: open file + switch mode + toast

**File:** `apps/web/src/features/chat/session-events.ts`

- Add `onPlanSaved?: (e: { filePath: string; relativePath: string }) => void` to `SessionEventHandlers`.

**File:** `apps/web/src/features/chat/hooks/use-session-stream.ts`

- Wire the `plan-saved` event:
  1. `useMainTabsStore.getState().addFileTab({ filePath, title: basename(relativePath), workspacePath: cwd })` — opens + focuses the plan tab (reuses [`apps/web/src/features/main-tabs/store.ts`](apps/web/src/features/main-tabs/store.ts)).
  2. `updateThreadMode.mutate({ threadId, mode: "code" })` — reuses [`useUpdateThreadMode` in `apps/web/src/features/workspace/mutations.ts:294`](apps/web/src/features/workspace/mutations.ts).
  3. `sonner` toast: `"Plan saved → switched to Code mode"` with an **Undo** action that flips mode back to `plan`.
- Idempotency: dedupe by `relativePath` within the session so a buffered event on reconnection doesn't re-toast or re-open the tab.

### 6. Inline plan card in chat

**File (new):** `apps/web/src/features/chat/components/plan-saved-card.tsx`

- When rendering tool blocks, if a `write` tool target starts with `.agents/plans/`, render this card instead of the generic write block.
- Card content: filename, "Open" button (calls `addFileTab`), "Implement plan" button that switches to code mode and seeds the input with `Implement the plan in .agents/plans/<basename>`.
- Hook into the existing tool-block renderer (locate during impl — likely in `markdown-components.tsx` or a tool-blocks component).

## Critical files

- `packages/pi-sdk/src/modes.ts` — add `write` to plan, new preamble, export `PLAN_DIR`
- `packages/pi-sdk/src/types.ts` — extend SessionEvent with `plan-saved`
- `apps/server/src/services/session-service.ts` — pre-create `.agents/plans/`
- `apps/server/src/session-events.ts` — detect tool-result + emit `plan-saved`
- `apps/web/src/features/chat/session-events.ts` — `onPlanSaved` handler type
- `apps/web/src/features/chat/hooks/use-session-stream.ts` — file open + mode switch + toast
- `apps/web/src/features/chat/components/plan-saved-card.tsx` — inline UI (new)

## Reused utilities

- `useMainTabsStore.getState().addFileTab(...)` — `apps/web/src/features/main-tabs/store.ts`
- `useUpdateThreadMode` mutation — `apps/web/src/features/workspace/mutations.ts:294`
- `MODE_CONFIG` / `getModePreamble` / `computeActiveToolsForMode` — `packages/pi-sdk/src/modes.ts`
- Existing tool-event flow through `apps/server/src/session-events.ts`
- `sonner` toast — already used in the app (confirm with grep during impl)
- Workspace `cwd` lookup pattern from `chat-view.tsx:196` (`workspaces.find(w => w.id === workspaceId)?.path`)

## Verification

1. Start the dev server. Create a new thread, switch to **Plan** in the combobox.
2. Send: *"Plan how to add a settings checkbox to disable autosave."*
3. Expect:
   - Agent investigates with read tools, then issues exactly one `write` to `.agents/plans/<slug>.md`.
   - A new focused tab opens in the file viewer rendering the plan markdown.
   - The mode pill flips from amber **Plan** to green **Code**.
   - Toast: *"Plan saved → switched to Code mode"* with an **Undo** action.
4. Edit the plan in the file viewer, save.
5. Send a follow-up: *"Now implement it."* — the agent (now in code mode) reads the plan file and edits source files.
6. **Negative test:** in a fresh plan-mode thread, ask the agent to "edit `src/index.ts`" — agent should refuse, citing plan mode (preamble), and only write to `.agents/plans/`.
7. **Undo flow:** click Undo in the toast → mode pill returns to amber Plan; further messages stay in plan mode.
8. **Reconnection:** refresh the page mid-thread. Buffered `plan-saved` event must not re-toast or re-open the tab (idempotency check). Mode is correct (read from thread DB).
9. **Directory create:** delete `.agents/plans/` locally, start a new session, confirm bootstrap recreates it before the first write.
