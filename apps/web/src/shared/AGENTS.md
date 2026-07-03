# AGENTS.md — web/src/shared

> Auto-generated context for coding agents. Last updated: 2026-04-28

## Purpose

Shared utilities and components for the lamda web application. Contains reusable UI components, React hooks, utilities, and app-wide configuration.

## Overview

Large shared module (54+ files) organized into subdirectories:

| Subdirectory  | Files | Purpose                                            |
| ------------- | ----- | -------------------------------------------------- |
| `ui/`         | 30    | shadcn/ui component library                        |
| `components/` | 5     | App-wide components (ThemeProvider, ErrorBoundary) |
| `hooks/`      | 2     | Shared React hooks                                 |
| `lib/`        | 12    | Utilities (API client, keyboard shortcuts, etc.)   |

## Architecture

```
shared/
├─ ui/                    # shadcn/ui component library
│  ├─ button.tsx
│  ├─ dialog.tsx
│  ├─ dropdown-menu.tsx
│  ├─ select.tsx
│  ├─ tabs.tsx
│  ├─ tooltip.tsx
│  ├─ accordion.tsx
│  ├─ sheet.tsx
│  ├─ popover.tsx
│  ├─ alert.tsx
│  ├─ alert-dialog.tsx
│  ├─ badge.tsx
│  ├─ card.tsx
│  ├─ skeleton.tsx
│  ├─ spinner.tsx
│  ├─ input.tsx
│  ├─ textarea.tsx
│  ├─ switch.tsx
│  ├─ toggle.tsx
│  ├─ toggle-group.tsx
│  ├─ kbd.tsx
│  ├─ label.tsx
│  ├─ field.tsx
│  ├─ input-group.tsx
│  ├─ button-group.tsx
│  ├─ separator.tsx
│  ├─ sidebar.tsx
│  ├─ breadcrumb.tsx
│  ├─ command.tsx
│  ├─ progress.tsx
│  ├─ resizable.tsx
│  ├─ sonner.tsx
│  └─ file-icon.tsx
│
├─ components/            # App-wide components
│  ├─ theme-provider.tsx  # Dark/light/system theme
│  ├─ error-boundary.tsx  # React error boundary
│  ├─ copy-button.tsx     # Clipboard copy button
│  ├─ keyboard-shortcuts-provider.tsx  # Global shortcuts
│  └─ theme-provider.tsx
│
├─ hooks/                 # Shared React hooks
│  ├─ use-mobile.ts       # Mobile viewport detection
│  └─ use-expandable.ts   # Expand/collapse state
│
└─ lib/                   # Utilities
   ├─ client.ts           # API client, ServerUnreachableError
   ├─ query-client.ts     # TanStack Query config
   ├─ utils.ts            # cn() utility, class merging
   ├─ storage-keys.ts     # localStorage key constants
   ├─ keyboard-shortcuts.ts  # Shortcut definitions
   ├─ provider-meta.tsx   # Provider metadata
   ├─ file-type-color.ts  # File type → color mapping
   ├─ formatters.ts       # Date/number formatting
   ├─ thinking-visibility.ts  # Thinking display settings
   ├─ syntax-theme.ts     # Code syntax theme config
   └─ client.ts           # Server URL resolution
```

## Key Files

### client.ts

- **`getServerUrl()`** — Resolves server URL (Electron port or VITE_SERVER_URL)
- **`getServerWsUrl()`** — WebSocket version of server URL
- **`apiUrl(path)`** — Build full API URL
- **`apiFetch<T>(path, init?)`** — Fetch with timeout (30s), error handling
- **`ServerUnreachableError`** — Custom error class for server connectivity issues
- **`isServerUnreachableError(error)`** — Type guard

**Timeout behavior:**

- Default timeout: 30 seconds
- Parent AbortSignal combined with timeout
- `AbortError` re-thrown as-is
- Timeout errors wrapped with duration info

### query-client.ts

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 2 * 60 * 1000,
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (isServerUnreachableError(error)) return false
        if (error instanceof Error && error.name === "AbortError") return false
        return failureCount < 1
      },
    },
  },
})
```

### theme-provider.tsx

- **`ThemeProvider`** — Context provider for dark/light/system theme
  - Reads from app settings (via TanStack Query)
  - Listens to system preference changes
  - Disables transitions temporarily during theme switch
  - Applies class `dark` or `light` to `document.documentElement`

- **`useTheme()`** — Consumer hook
  - Returns: `{ theme, resolvedTheme, setTheme }`

### error-boundary.tsx

- **`ErrorBoundary`** — React error boundary component
  - `fallback?: (error, reset) => ReactNode` prop
  - Default fallback shows error message + retry button
  - Logs errors to console with component stack

### keyboard-shortcuts-provider.tsx

- **`KeyboardShortcutsProvider`** — Global keyboard shortcut handler
- **`useShortcutHandler(action, callback)`** — Register shortcut
- **`SHORTCUT_ACTIONS`** — Enum of available actions (TOGGLE_THEME, etc.)

### hooks/use-mobile.ts

- **`useIsMobile()`** — Returns `true` if viewport < 768px
  - Subscribes to `matchMedia` changes
  - Initial state set on mount

### hooks/use-expandable.ts

- **`useExpandable()`** — Expand/collapse state hook
  - Returns: `{ isExpanded, toggle, setExpanded }`

### lib/utils.ts

- **`cn(...inputs)`** — Class name merger (shadcn cn utility)
- Uses `clsx` + `tailwind-merge`

### lib/storage-keys.ts

- **`APP_SETTINGS_KEYS`** — Constants for localStorage keys
  - `THEME`, `THINKING_VISIBILITY`, etc.

### lib/keyboard-shortcuts.ts

- **`SHORTCUT_ACTIONS`** — Action identifiers for shortcuts
- **`SHORTCUTS`** — Shortcut definitions (key combos)

### lib/provider-meta.tsx

- Provider display metadata (icons, colors, names)

### lib/file-type-color.ts

- **`getFileTypeColor(extension)`** — Returns color for file extension
- **`FILE_TYPE_COLORS`** — Mapping of extensions to colors

### lib/formatters.ts

- **`formatDate(timestamp)`** — Human-readable date
- **`formatNumber(n)`** — Locale-aware number formatting

### lib/syntax-theme.ts

- Code syntax highlighting theme configuration

### lib/thinking-visibility.ts

- **`THINKING_VISIBILITY_OPTIONS`** — User preference options
- **`DEFAULT_THINKING_VISIBILITY`** — Default setting

## Conventions

- **shadcn/ui base** — UI components from shadcn/ui (base-ui port)
- **Tailwind CSS 4** — Uses `@apply` and Tailwind classes
- **TypeScript strict** — Full type safety across all files
- **Server URL caching** — `resolvedServerUrl` cached after first resolution
- **Error handling** — `ServerUnreachableError` thrown on connectivity issues
- **No side effects in utils** — Pure functions, no React hooks in lib/

## Dependencies

- `@tanstack/react-query` — Query client
- `clsx` — Class name utility
- `tailwind-merge` — Tailwind class merging
- `lucide-react` — Icons

## UI Component Pattern

All shadcn/ui components follow this pattern:

```typescript
// Re-export from base-ui
export { Component, type Props } from "some-ui"

// Extend with Tailwind styling
export function Component({ className, ...props }: Props) {
  return <Component className={cn("tailwind-classes", className)} {...props} />
}
```

## Gotchas

- **Server URL resolution order**:
  1. `VITE_SERVER_URL` env var (if set)
  2. Electron port from `getServerPort()` (Electron only)
  3. Error if neither available
- **Theme transitions disabled** — `disableTransitionsTemporarily()` prevents flash
- **localStorage vs server** — Settings stored on server, cached in TanStack Query
- **Mobile breakpoint** — Hardcoded at 768px (not configurable)
- **Abort signal propagation** — Parent signals combined with request timeout

## Related

- [apps/web/AGENTS.md](../../AGENTS.md) — Parent web app
- [features/settings/AGENTS.md](../features/settings/AGENTS.md) — Settings storage
- [features/electron/AGENTS.md](../features/electron/AGENTS.md) — Electron integration
