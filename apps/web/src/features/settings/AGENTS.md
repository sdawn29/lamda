# AGENTS.md — web/src/features/settings

> Auto-generated context for coding agents. Last updated: 2026-04-28

## Purpose

Settings feature module — manages provider configuration, API key management, retry settings, and application preferences via a modal/page interface.

## Overview

The settings module provides user-facing configuration UI for AI provider selection (Anthropic, OpenAI, Google Gemini, DeepSeek, etc.), API key management, and runtime behavior tuning.

## Architecture

```
┌─ settings-page.tsx (main component)
│  └─ Full-page settings view with tabbed sections
│
├─ context.tsx
│  ├─ SettingsModalProvider — manages modal open/close state
│  └─ useSettingsModal() — hook to control modal visibility
│
├─ configure-provider-context.tsx
│  ├─ ConfigureProviderProvider — manages provider configuration flow
│  └─ useConfigureProvider() — hook to access provider config
│
├─ provider-cards.tsx
│  └─ Provider selection cards with API key input and status
│
└─ components/
   ├─ settings-page.tsx — Tabbed settings UI
   ├─ settings-modal.tsx — Modal wrapper
   └─ configure-provider-modal.tsx — Provider configuration modal
```

## Key Files

### Main Components

- **`components/settings-page.tsx`** (46,906 bytes — largest file in web app)
  - Tabbed interface for settings categories
  - Sections: General, Providers, API Keys, Advanced
  - Provider management: add, remove, configure providers
  - API key storage: reads from `~/.pi/agent/auth.json`
  - Settings persistence: uses TanStack Query mutations to save to server

- **`components/settings-modal.tsx`** — Modal wrapper
  - Simple overlay with close button
  - Renders settings content inside modal

- **`components/configure-provider-modal.tsx`** — Provider config form
  - API key input field
  - Model selection dropdown
  - Base URL override (for custom endpoints)
  - Save/Cancel actions

### Contexts

- **`context.tsx`** — SettingsModal state management
  ```typescript
  interface SettingsModalValue {
    isOpen: boolean
    open: () => void
    close: () => void
    toggle: () => void
  }
  ```

- **`configure-provider-context.tsx`** — Provider configuration state
  ```typescript
  interface ConfigureProviderValue {
    activeTab: ConfigureProviderTab
    setActiveTab: (tab: ConfigureProviderTab) => void
    // ... tab definitions
  }
  ```

### Data Management

- **`api.ts`** — Server communication for settings
  - `getSettings()` — Fetch current settings
  - `saveSettings(settings)` — Persist settings to server
  - `getProviders()` — List configured providers
  - `saveProvider(provider)` — Save provider config

- **`queries.ts`** — TanStack Query hooks
  - `useSettings()` — Current settings from server

- **`mutations.ts`** — TanStack Mutations
  - `useUpdateSettings()` — Save settings mutation
  - `useAddProvider()` — Add new provider
  - `useRemoveProvider()` — Remove provider
  - `useUpdateProvider()` — Update provider config

## Exports

```typescript
// index.ts barrel
export { SettingsPage } from "./components/settings-page"
export { SettingsModal } from "./components/settings-modal"
export { SettingsModalProvider, useSettingsModal } from "./context"
export { ConfigureProviderProvider, useConfigureProvider } from "./configure-provider-context"
export { ConfigureProviderModal } from "./components/configure-provider-modal"
export type { ConfigureProviderTab } from "./configure-provider-context"
```

## Provider Configuration

### Supported Providers

| Provider | API Key Env | Base URL |
|----------|-------------|----------|
| Anthropic | `ANTHROPIC_API_KEY` | `https://api.anthropic.com` |
| OpenAI | `OPENAI_API_KEY` | `https://api.openai.com` |
| Google Gemini | `GOOGLE_API_KEY` | `https://generativelanguage.googleapis.com` |
| DeepSeek | `DEEPSEEK_API_KEY` | `https://api.deepseek.com` |
| OpenRouter | `OPENROUTER_API_KEY` | `https://openrouter.ai` |
| Ollama | (local) | `http://localhost:11434` |
| Groq | `GROQ_API_KEY` | `https://api.groq.com` |
| Mistral | `MISTRAL_API_KEY` | `https://api.mistral.ai` |
| Perplexity | `PERPLEXITY_API_KEY` | `https://api.perplexity.ai` |

### Provider Card States

- **Unconfigured:** No API key, shows "Configure" button
- **Configured:** API key present, shows model selector, status indicator
- **Active:** Currently selected provider for chat sessions
- **Error:** API key invalid or quota exceeded

## Settings Structure

### General Settings

- Theme preference (dark/light/system)
- Thinking visibility (show/hide thinking blocks)
- Auto-scroll behavior
- Font size

### Provider Settings

- Per-provider API keys
- Model selection per provider
- Base URL override
- Custom headers

### Advanced Settings

- Retry configuration (max attempts, delay, backoff)
- Timeout settings
- Context window limits

## Conventions

- **Provider config stored in:** `~/.pi/agent/auth.json` (via auth service)
- **Settings persisted to:** SQLite via `/settings` API endpoints
- **API key validation:** Client-side format check + server-side auth test
- **No sensitive data in UI logs** — API keys masked in UI
- **Settings sync:** Uses TanStack Query for optimistic updates

## Dependencies

- `@tanstack/react-query` — Settings state management
- `lucide-react` — Icons
- UI components from `@/shared/ui/`

## Gotchas

- **Provider cards are heavy** — `provider-cards.tsx` is 22KB, lazy-load if not in initial viewport
- **API keys stored on filesystem** — Not in SQLite; managed by auth service in server
- **Settings page is large** — 46KB is the largest file; consider code-splitting tabs
- **No settings migration** — Adding new settings fields requires manual handling in migration
- **Concurrent edits** — No locking; last write wins
- **Provider availability** — Some providers (Ollama) require local server running

## Related

- [apps/server/routes/settings.ts](../../../server/src/routes/settings.ts) — Settings API endpoints
- [apps/server/services/auth-service.ts](../../../server/src/services/auth-service.ts) — Auth storage (API keys)
- [apps/web/features/chat/AGENTS.md](../chat/AGENTS.md) — Chat uses settings for provider selection