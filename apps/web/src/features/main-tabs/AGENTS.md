# AGENTS.md — web/src/features/main-tabs

> Auto-generated context for coding agents. Last updated: 2026-05-16

## Purpose

Manages the main tab bar UI for thread and file tabs, including tab ordering, active state, and thread confirmation flow. Uses Zustand with localStorage persistence via `zustand/middleware`.

## Quick Reference

| Action | File | Description |
|--------|------|-------------|
| Tab state | `store.ts` | `useMainTabsStore` — manages all tabs and active state |
| Tab bar UI | `components/main-tab-bar.tsx` | Renders tab bar with drag-to-reorder support |
| Thread tab | `components/tabs-empty-state.tsx` | Empty state when no tabs are open |
| File content | `components/file-content-view.tsx` | Displays file content in a tab |

## Public API

```typescript
// store.ts exports
export type MainTab = ThreadMainTab | FileMainTab

export interface ThreadMainTab {
  id: string
  type: "thread"
  threadId: string
  title: string
}

export interface FileMainTab {
  id: string
  type: "file"
  filePath: string
  title: string
  workspacePath?: string
  openWithAppId?: string | null
}

export function useMainTabs() // Returns store state + activeTab
```

## State Shape

```typescript
interface MainTabsStore {
  tabs: MainTab[]
  activeTabId: string | null
  pendingThreadIds: Set<string> // Threads awaiting confirmation
  addThreadTab: (threadId: string, title: string, pending?: boolean) => void
  addFileTab: (tab: Omit<FileMainTab, "id" | "type">) => void
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  updateThreadTitle: (threadId: string, title: string) => void
  confirmThread: (threadId: string) => void // Removes from pendingThreadIds
  reorderTabs: (draggedId: string, targetId: string, before: boolean) => void
}
```

## Key Behaviors

- **Tab deduplication**: Adding a thread/file tab that already exists just activates it instead of creating a duplicate
- **Thread pending state**: New threads can be added as "pending" (shown differently) until confirmed via `confirmThread()`
- **Auto-activate on add**: New tabs automatically become the active tab
- **Close navigation**: When closing active tab, auto-activate the previous tab (or first if no previous)

## Tab ID Format

- Thread tabs: `thread-{threadId}`
- File tabs: `file-{timestamp}-{random}` (e.g., `file-1715875200000-a1b2c`)

## Related

- [apps/web/src/features/layout](./layout/AGENTS.md) — Integrates MainTabBar into the layout
- [apps/web/src/features/chat](./chat/AGENTS.md) — Thread tabs are created from chat interactions
- [apps/web/src/features/file-opening](./file-opening/AGENTS.md) — File tabs created when opening files