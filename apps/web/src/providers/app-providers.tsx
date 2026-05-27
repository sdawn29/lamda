import { type ReactNode } from "react"

import {
  useThreadStatus,
  useSetThreadStatus,
  type ThreadStatus,
  ErrorToastProvider,
  useErrorToast,
  type ErrorMessage,
} from "@/features/chat"
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
export { useCommandPalette }

// Re-export types
export type { ThreadStatus, ErrorMessage }
