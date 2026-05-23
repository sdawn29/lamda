import { type ReactNode } from "react"

import {
  useThreadStatus,
  useSetThreadStatus,
  type ThreadStatus,
  ErrorToastProvider,
  useErrorToast,
  type ErrorMessage,
} from "@/features/chat"
import { useSettingsModal } from "@/features/settings"
import { useConfigureProvider, type ConfigureProviderTab } from "@/features/settings"
import { useCommandPalette } from "@/features/command-palette"

export interface AppProvidersProps {
  children: ReactNode
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <ErrorToastProvider>
      {children}
    </ErrorToastProvider>
  )
}

// Re-export hooks for convenience
export { useThreadStatus, useSetThreadStatus, useErrorToast }
export { useSettingsModal, useConfigureProvider }
export { useCommandPalette }

// Re-export types
export type { ThreadStatus, ErrorMessage }
export type { ConfigureProviderTab }
