import { type ReactNode } from "react"

import {
  ThreadStatusProvider,
  useThreadStatus,
  useSetThreadStatus,
  type ThreadStatus,
  ErrorToastProvider,
  useErrorToast,
  type ErrorMessage,
} from "@/features/chat"
import {
  SettingsModalProvider,
  useSettingsModal,
  ConfigureProviderProvider,
  useConfigureProvider,
  type ConfigureProviderTab,
} from "@/features/settings"
import { CommandPaletteProvider, useCommandPalette } from "@/features/command-palette"

// ============================================================================
// AppProviders - Consolidated Global Provider Component
// ============================================================================

export interface AppProvidersProps {
  children: ReactNode
}

/**
 * Consolidated global providers for the application.
 * 
 * Note: KeyboardShortcutsProvider must wrap ThemeProvider in main.tsx
 * because ThemeProvider uses useShortcutHandler for the theme toggle.
 * 
 * Provider Order (outer to inner):
 * 1. ThreadStatusProvider - manages thread status state
 * 2. ErrorToastProvider - handles API error toasts
 * 3. SettingsModalProvider - manages settings modal state
 * 4. ConfigureProviderProvider - manages provider configuration modal state
 * 5. WorkspaceProvider - provides workspace context (wraps feature providers)
 */
export function AppProviders({ children }: AppProvidersProps) {
  return (
    <ThreadStatusProvider>
      <ErrorToastProvider>
        <SettingsModalProvider>
          <ConfigureProviderProvider>
            <CommandPaletteProvider>
              {children}
            </CommandPaletteProvider>
          </ConfigureProviderProvider>
        </SettingsModalProvider>
      </ErrorToastProvider>
    </ThreadStatusProvider>
  )
}

// Re-export hooks for convenience
export { useThreadStatus, useSetThreadStatus, useErrorToast }
export { useSettingsModal, useConfigureProvider }
export { useCommandPalette }

// Re-export types
export type { ThreadStatus, ErrorMessage }
export type { ConfigureProviderTab }
