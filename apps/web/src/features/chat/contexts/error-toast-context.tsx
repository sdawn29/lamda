import {
  useCallback,
  useEffect,
  useRef,
  type ReactNode
} from "react"
import { create } from "zustand"
import { toast } from "sonner"
import { type ErrorMessage } from "@/features/chat"

interface ErrorToastContextValue {
  showApiError: (error: ErrorMessage) => void
  dismissApiError: (id: string) => void
}

interface ErrorToastStore extends ErrorToastContextValue {
  initialized: boolean
  setInitialized: (value: boolean) => void
  setShowApiError: (fn: ErrorToastContextValue["showApiError"]) => void
  setDismissApiError: (fn: ErrorToastContextValue["dismissApiError"]) => void
}

const noop = () => {}

const useErrorToastStore = create<ErrorToastStore>((set) => ({
  initialized: false,
  showApiError: noop,
  dismissApiError: noop,
  setInitialized: (value) => set({ initialized: value }),
  setShowApiError: (fn) => set({ showApiError: fn }),
  setDismissApiError: (fn) => set({ dismissApiError: fn }),
}))

export function ErrorToastProvider({ children }: { children: ReactNode }) {
  const activeToastsRef = useRef<Map<string, string>>(new Map())
  const setInitialized = useErrorToastStore((state) => state.setInitialized)
  const setShowApiError = useErrorToastStore((state) => state.setShowApiError)
  const setDismissApiError = useErrorToastStore((state) => state.setDismissApiError)

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

      const retryAction = error.action?.type === "retry" ? error.action : null
      const canRetry = retryAction != null && !!retryAction.prompt

      const description = error.retryCount != null
        ? `Retry attempt ${error.retryCount}`
        : error.message

      if (existingToastId) {
        toast.error(error.title, {
          id: existingToastId,
          description,
          duration: Infinity,
        })
        return
      }

      const toastId = toast.error(error.title, {
        description,
        duration: canRetry ? Infinity : 8000,
        onDismiss: () => { activeToastsRef.current.delete(error.id) },
        onAutoClose: () => { activeToastsRef.current.delete(error.id) },
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

  useEffect(() => {
    setInitialized(true)
    return () => {
      setShowApiError(noop)
      setDismissApiError(noop)
      setInitialized(false)
    }
  }, [setDismissApiError, setInitialized, setShowApiError])

  useEffect(() => {
    setDismissApiError(dismissApiError)
  }, [dismissApiError, setDismissApiError])

  useEffect(() => {
    setShowApiError(showApiError)
  }, [setShowApiError, showApiError])

  return <>{children}</>
}

export function useErrorToast() {
  const initialized = useErrorToastStore((state) => state.initialized)
  const showApiError = useErrorToastStore((state) => state.showApiError)
  const dismissApiError = useErrorToastStore((state) => state.dismissApiError)
  if (!initialized) {
    throw new Error("useErrorToast must be used within ErrorToastProvider")
  }
  return { showApiError, dismissApiError }
}
