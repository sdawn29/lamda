# Layout Refactor: Workspace Layout

## Context

The current layout is wired inline inside `RootLayoutInner` in `__root.tsx`, making it hard to maintain. The right sidebar uses a tab-based approach (switch between DiffPanel or FileTree) — the new design shows DiffPanel as the permanent primary content of the right sidebar, while FileTree lives as a **collapsible nested sidebar** to its right. All panels are arranged horizontally. A new dedicated `WorkspaceLayout` component extracts and owns the full layout logic.

---

## Target Layout (horizontal everywhere)

```
SidebarProvider
├── NavigationControls (fixed overlay, top-left)
├── AppSidebar (left — workspaces + threads list, unchanged)
└── ResizablePanelGroup [horizontal]
    ├── ResizablePanel  →  SidebarInset
    │                       ├── TitleBar
    │                       ├── UpdateBanner
    │                       └── ResizablePanelGroup [vertical]
    │                           ├── MainContentArea
    │                           └── TerminalPanel (collapsible, bottom strip)
    ├── ResizableHandle (visible when right sidebar open)
    └── ResizablePanel  →  RightSidebarContent
                            └── ResizablePanelGroup [horizontal]
                                ├── ResizablePanel  →  DiffPanel (fills remaining space)
                                ├── ResizableHandle (visible when file tree open)
                                └── ResizablePanel  →  FileTree nested sidebar (collapsible)
```

---

## Store Changes

**File:** `src/features/layout/store/right-sidebar.ts`

Replace the `activePanel: "files" | "changes"` concept with two independent booleans:

```typescript
interface RightSidebarStore {
  isOpen: boolean           // entire right sidebar (DiffPanel area)
  isFileTreeOpen: boolean   // nested FileTree sidebar inside right sidebar

  open: () => void
  close: () => void
  toggle: () => void
  openFileTree: () => void
  closeFileTree: () => void
  toggleFileTree: () => void

  // backward compat for title-bar.tsx
  togglePanel: (panel: "changes" | "files") => void
}
```

`togglePanel("changes")` → toggles `isOpen` (the whole right sidebar)  
`togglePanel("files")` → toggles `isFileTreeOpen` (nested file tree)

Initial state: `isOpen: false`, `isFileTreeOpen: false`.

---

## Files to Create / Modify

### 1. NEW: `src/features/layout/components/workspace-layout.tsx`

Extract `RootLayoutInner` from `__root.tsx` into this component. It owns:
- `terminalPanelRef` and `rightSidebarPanelRef` (`useRef<PanelImperativeHandle>`)
- `useEffect` hooks that imperatively expand/collapse panels
- Session/workspace/file-tab derivation logic for the right sidebar props (`rsSessionId`, `rsWorkspaceId`, `rsWorkspacePath`, `rsOpenWithAppId`)
- The outer `ResizablePanelGroup` structure

`MainContentArea` and `UpdateBanner` move here from `__root.tsx` (they are only used in this file).

`RootLayoutInner` in `__root.tsx` becomes a thin wrapper:
```tsx
function RootLayoutInner() {
  if (isLoading) return <SplashScreen />
  return <WorkspaceLayout />
}
```

### 2. MODIFY: `src/features/layout/components/right-sidebar.tsx`

Remove the `PanelTab` switcher and the `activePanel` logic entirely.

New structure — the component root becomes a horizontal `ResizablePanelGroup`:

```tsx
export function RightSidebarContent({ sessionId, openWithAppId, workspaceId, workspacePath }) {
  const { close, isFileTreeOpen } = useRightSidebar()
  const fileTreePanelRef = useRef<PanelImperativeHandle>(null)

  // sync file tree panel open/close imperatively
  useEffect(() => {
    const p = fileTreePanelRef.current
    if (!p) return
    isFileTreeOpen ? p.expand() : p.collapse()
  }, [isFileTreeOpen])

  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full w-full">
      {/* Primary: DiffPanel section */}
      <ResizablePanel className="flex min-w-0 flex-col overflow-hidden">
        <SidebarHeader> {/* fullscreen + close buttons */} </SidebarHeader>
        <SidebarContent className="p-0">
          {sessionId
            ? <Suspense><DiffPanel sessionId={sessionId} openWithAppId={openWithAppId} isEmbedded /></Suspense>
            : <EmptyState />}
        </SidebarContent>
      </ResizablePanel>

      {/* Nested FileTree sidebar */}
      <ResizableHandle withHandle className={cn(!isFileTreeOpen && "hidden")} />
      <ResizablePanel
        panelRef={fileTreePanelRef}
        collapsible collapsedSize={0}
        defaultSize={35} minSize={20} maxSize={50}
      >
        <div className="h-full border-l bg-sidebar overflow-hidden">
          {workspaceId && workspacePath
            ? <Suspense><FileTree workspaceId={workspaceId} workspacePath={workspacePath} /></Suspense>
            : <EmptyState message="Open a workspace to browse files" />}
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
```

Props interface stays the same.

### 3. MODIFY: `src/features/layout/store/right-sidebar.ts`

Implement the store as described in the Store Changes section above.

### 4. MODIFY: `src/features/layout/components/title-bar.tsx`

Update lines 55–59 — the two state derivations:

```typescript
// Before:
const { isOpen: rightSidebarOpen, activePanel: rightSidebarPanel, togglePanel } = useRightSidebar()
const diffOpen = rightSidebarOpen && rightSidebarPanel === "changes"
const fileTreeOpen = rightSidebarOpen && rightSidebarPanel === "files"

// After:
const { isOpen: rightSidebarOpen, isFileTreeOpen, togglePanel } = useRightSidebar()
const diffOpen = rightSidebarOpen
const fileTreeOpen = isFileTreeOpen
```

`toggleDiff` and `toggleFileTree` keep calling `togglePanel("changes")` and `togglePanel("files")` — the store remaps these.

### 5. MODIFY: `src/features/layout/index.ts`

Add export:
```typescript
export { WorkspaceLayout } from "./components/workspace-layout"
```

### 6. MODIFY: `src/routes/__root.tsx`

- Import `WorkspaceLayout` from `@/features/layout`
- Remove all extracted logic from `RootLayoutInner` (refs, effects, session derivation, `ResizablePanelGroup` JSX)
- Move `MainContentArea` and `UpdateBanner` into `workspace-layout.tsx`
- `RootLayoutInner` shrinks to just the loading check + `<WorkspaceLayout />`

---

## Critical Files

| File | Role |
|---|---|
| `src/routes/__root.tsx` | Thin shell after refactor |
| `src/features/layout/components/workspace-layout.tsx` | **NEW** — owns full layout logic |
| `src/features/layout/components/right-sidebar.tsx` | Horizontal DiffPanel + nested FileTree |
| `src/features/layout/store/right-sidebar.ts` | Two-boolean store |
| `src/features/layout/components/title-bar.tsx` | Update 3 lines |
| `src/features/layout/index.ts` | Add WorkspaceLayout export |

---

## Verification

1. `pnpm dev` from `apps/web` — app loads without errors.
2. Left sidebar shows workspaces + threads (unchanged from AppSidebar).
3. Click FileDiff icon in TitleBar → right sidebar opens, DiffPanel visible.
4. Click FolderTree icon → FileTree slides in to the right of DiffPanel as a nested sidebar.
5. Resize the handle between DiffPanel and FileTree — both panels remain functional.
6. Click FolderTree icon again → FileTree collapses, DiffPanel fills the space.
7. Click FileDiff icon again → entire right sidebar closes.
8. Terminal toggle still works (bottom strip in main content area).
9. `pnpm typecheck` — zero new errors.
