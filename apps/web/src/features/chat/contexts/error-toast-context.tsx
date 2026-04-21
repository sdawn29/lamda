"use client"

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  type ReactNode,
} from "react"
import { toast } from "sonner"
import { type ErrorMessage } from "@/features/chat"

interface ErrorToastContextValue {
  showApiError: (error: ErrorMessage) => void
  dismissApiError: (id: string) => void
}

const ErrorToastContext = createContext<ErrorToastContextValue | null>(null)

export function ErrorToastProvider({ children }: { children: ReactNode }) {
  // Track active error toasts by error ID to avoid duplicates
  const activeToastsRef = useRef<Map<string, string>>(new Map())

  const dismissApiError = useCallback((id: string) => {
    const toastId = activeToastsRef.current.get(id)
    if (toastId) {
      toast.dismiss(toastId)
      activeToastsRef.current.delete(id)
    }
  }, [])

  const showApiError = useCallback(
    (error: ErrorMessage) => {
      const existingToastId = activeToastsRef.current.get(error.id)

      const content = (
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="text-sm font-medium leading-tight text-foreground">
            {error.title}
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {error.message}
          </p>
          {error.retryCount != null && (
            <p className="text-xs text-muted-foreground/60">
              Retry attempt {error.retryCount}
            </p>
          )}
        </div>
      )

      if (existingToastId) {
        // Update existing toast while preserving the same toast ID
        toast.error(content, {
          id: existingToastId,
          duration: Infinity,
        })
        return
      }

      const retryAction = error.action?.type === "retry" ? error.action : null
      const canRetry = retryAction != null && !!retryAction.prompt

      const toastId = toast.error(content, {
        duration: canRetry ? Infinity : 8000,
        action:
          canRetry
            ? {
                label: "Retry",
                onClick: () => {
                  window.dispatchEvent(
                    new CustomEvent("chat-retry", {
                      detail: { prompt: retryAction.prompt },
                    })
                  )
                },
              }
            : undefined,
        cancel:
          error.action?.type === "dismiss"
            ? {
                label: "Dismiss",
                onClick: () => dismissApiError(error.id),
              }
            : undefined,
      })

      activeToastsRef.current.set(error.id, String(toastId))
    },
    [dismissApiError]
  )

  return (
    <ErrorToastContext.Provider value={{ showApiError, dismissApiError }}>
      {children}
    </ErrorToastContext.Provider>
  )
}

export function useErrorToast() {
  const context = useContext(ErrorToastContext)
  if (!context) {
    throw new Error("useErrorToast must be used within ErrorToastProvider")
  }
  return context
}
