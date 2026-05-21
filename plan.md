# Plan: Performance & Code Quality Improvements — apps/web

## Context
The chat feature is the core of this application. React Compiler (Babel plugin) is already enabled in `vite.config.ts`, so it auto-memoizes most component-level computations. This plan targets what the compiler *cannot* fix: context provider object identity, effect dependency correctness, code duplication, and dead code. All changes are independent and can be applied incrementally.

---

## Changes

### 1. Memoize ErrorToastProvider context value
**File:** `src/features/chat/contexts/error-toast-context.tsx`  
**Problem:** Line 84 — `value={{ showApiError, dismissApiError }}` creates a new object every render. Both callbacks are already `useCallback`-wrapped with stable deps, so the object identity is the only thing causing all `useErrorToast()` consumers to re-render on every parent render.  
**Fix:**
- Add `useMemo` to the React import (line 3–9)
- Wrap the provider value: `value={useMemo(() => ({ showApiError, dismissApiError }), [showApiError, dismissApiError])}`
- Also remove the `"use client"` directive on line 1 (Next.js only, unused in Vite)

### 2. Stabilize auto-dismiss timer in ChatErrorAlert
**File:** `src/features/chat/components/chat-error-alert.tsx`  
**Problem:** Line 34 — `onAction` is in the effect dep array. `onAction` maps to `handleErrorAction` in `chat-view.tsx`, which has a TanStack Query mutation object in its deps → new identity on every parent render → 4-second timer restarts during streaming.  
**Fix:** Use a ref to hold the latest `onAction` without making it a dep:
```tsx
const onActionRef = useRef(onAction)
useLayoutEffect(() => { onActionRef.current = onAction })

useEffect(() => {
  if (!shouldAutoDismiss || !error) return
  const id = error.id
  timerRef.current = setTimeout(() => {
    onActionRef.current({ type: "dismiss" }, id)
  }, 4000)
  return () => { if (timerRef.current) clearTimeout(timerRef.current) }
}, [error?.id, shouldAutoDismiss])  // onAction removed
```
Add `useLayoutEffect` to the React import.

### 3. Fix stale `messages` dep in WorkingBlock start-time effect
**File:** `src/features/chat/components/working-block.tsx`  
**Problem:** Lines 77–89 — dep array `[isActive, messages]`. The effect is guarded by `startTimeRef.current === null` and only does meaningful work once; the `messages` dep causes it to re-run on every streamed message for no benefit.  
**Fix:** Extract timestamp computation into a `useMemo`, then use the stable derived value in the effect:
```tsx
const earliestTimestamp = useMemo(() => {
  const ts: number[] = []
  for (const m of messages) {
    if (m.role === "assistant" && (m as AssistantMessage).createdAt != null)
      ts.push((m as AssistantMessage).createdAt!)
    else if (m.role === "tool" && (m as ToolMessage).startTime != null)
      ts.push((m as ToolMessage).startTime!)
  }
  return ts.length > 0 ? Math.min(...ts) : null
}, [messages])

useEffect(() => {
  if (isActive && startTimeRef.current === null) {
    startTimeRef.current = earliestTimestamp ?? Date.now()
  }
}, [isActive, earliestTimestamp])
```

### 4. Fix stale `messages` dep in WorkingBlock auto-collapse effect
**File:** `src/features/chat/components/working-block.tsx`  
**Problem:** Lines 104–117 — dep array `[isActive, messages]`. The `messages` dep only matters in the fallback branch `computeHistoricalDuration(messages)` when `startTimeRef.current === null`. After fix #3, this fallback is only hit for historical (never-active) blocks. The effect fires on every streamed message during active sessions unnecessarily.  
**Fix:** Remove `messages` from deps, use only `[isActive]`:
```tsx
useEffect(() => {
  const wasActive = prevActiveRef.current
  prevActiveRef.current = isActive

  if (wasActive && !isActive) {
    const duration = startTimeRef.current !== null
      ? Date.now() - startTimeRef.current
      : null  // displayDuration useMemo covers historical fallback
    if (duration !== null) setFinalDuration(duration)
    setExpanded(false)
  }
}, [isActive])
```
`displayDuration` (lines 119–122) already calls `computeHistoricalDuration(messages)` via `useMemo`, so historical blocks still show correct durations.

### 5. Extract shared dropdown scroll hook
**New file:** `src/features/chat/hooks/use-dropdown-scroll.ts`  
**Files to update:** `file-mention-dropdown.tsx` (lines 22–29), `slash-command-dropdown.tsx` (lines 21–28)  
**Problem:** Identical 6-line `useRef` + `useEffect` pattern duplicated in both files.  
**Fix:** Create the hook:
```ts
import { useEffect, useRef } from "react"

export function useDropdownScroll(selectedIndex: number) {
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const item = list.children[selectedIndex] as HTMLElement | undefined
    item?.scrollIntoView({ block: "nearest" })
  }, [selectedIndex])
  return listRef
}
```
In both dropdown components, replace the `useRef` + `useEffect` block with a single line:
```tsx
const listRef = useDropdownScroll(selectedIndex)
```
Remove the `useEffect` and `useRef` imports if no longer needed.  
Export the new hook from `src/features/chat/hooks/index.ts`.

### 6. Remove `"use client"` from non-Next.js files
**Files:**
- `src/features/chat/contexts/error-toast-context.tsx` line 1 (covered above in #1)
- `src/features/chat/hooks/use-api-error-toasts.ts` line 1  

These are Vite-only files. The directive does nothing here but misleads developers. The `shared/ui/` files (shadcn-generated) can remain untouched — those are managed by the shadcn CLI.

### 7. Delete dead file: `thread-status-context.tsx`
**File:** `src/features/chat/thread-status-context.tsx`  
**Evidence:** `grep -r "thread-status-context" src/` returns zero matches outside the file itself. All live exports (`useSetThreadStatus`, `useSetActiveThreadId`, `initThreadStatusWebSocket`) come from `thread-status-store.ts` (Zustand). The 279-line React context implementation is unreachable from any route or provider tree.  
**Fix:** Delete the file. Vite tree-shakes it anyway, but its presence is misleading.

---

## Files Changed

| File | Change |
|---|---|
| `src/features/chat/contexts/error-toast-context.tsx` | Memoize context value; remove `"use client"` |
| `src/features/chat/components/chat-error-alert.tsx` | Stabilize `onAction` via ref |
| `src/features/chat/components/working-block.tsx` | Fix 2 effect dep arrays (#3 and #4) |
| `src/features/chat/hooks/use-dropdown-scroll.ts` | New shared hook (create) |
| `src/features/chat/components/file-mention-dropdown.tsx` | Use shared hook |
| `src/features/chat/components/slash-command-dropdown.tsx` | Use shared hook |
| `src/features/chat/hooks/index.ts` | Export new hook |
| `src/features/chat/hooks/use-api-error-toasts.ts` | Remove `"use client"` |
| `src/features/chat/thread-status-context.tsx` | Delete (dead code) |

---

## Verification

1. **Type check:** `pnpm --filter web typecheck` — must pass with zero errors
2. **Build:** `pnpm --filter web build` — must complete successfully
3. **Dev smoke test (streaming):** Start dev server, send a message and watch it stream — "Working for N.Ns" timer should count correctly, collapse when done, and show the correct elapsed time
4. **Error banner timer:** Trigger a dismissible error, verify the banner auto-disappears after ~4 seconds and does not restart during streaming
5. **Dropdown keyboard nav:** Open `@` file mention and `/` command dropdowns with arrow keys — selected item should stay scrolled into view
