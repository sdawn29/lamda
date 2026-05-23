# AGENTS.md — web/src/providers

> Auto-generated context for coding agents. Last updated: 2026-05-17

## Purpose

Central provider composition layer for the lamda web application. Exports common hooks and context from feature modules under a single `AppProviders` namespace.

## AppProviders Component

```typescript
export function AppProviders({ children }: AppProvidersProps) {
  return (
    <ErrorToastProvider>
      {children}
    </ErrorToastProvider>
  )
}
```

**Note:** Currently only wraps `ErrorToastProvider`. Other providers (ThemeProvider, WorkspaceProvider) live in `routes/__root.tsx`.

## Re-exports

| Export | Source | Type |
|--------|--------|------|
| `useThreadStatus`, `useSetThreadStatus` | `@/features/chat` | hook |
| `useErrorToast` | `@/features/chat` | hook |
| `useSettingsModal`, `useConfigureProvider` | `@/features/settings` | hook |
| `useCommandPalette` | `@/features/command-palette` | hook |
| `ThreadStatus` | `@/features/chat` | type |
| `ErrorMessage` | `@/features/chat` | type |
| `ConfigureProviderTab` | `@/features/settings` | type |

## Conventions

- **Re-export pattern** — consolidates imports; consumers import from `@/providers` instead of feature modules
- **Types re-exported** — enables type-only imports without importing implementations

## Related

- [apps/web/src/routes/AGENTS.md](../routes/AGENTS.md) — Where AppProviders is used in root layout
- [features/chat/AGENTS.md](../features/chat/AGENTS.md) — Thread status and error toast providers
- [features/settings/AGENTS.md](../features/settings/AGENTS.md) — Settings modal and provider configuration