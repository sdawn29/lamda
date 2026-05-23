import { useEffect, useRef } from "react"
import { type ErrorMessage } from "../types"
import { useErrorToast } from "../contexts/error-toast-context"

interface UseApiErrorToastsOptions {
  /** The IDs of errors currently being shown as messages (to avoid duplicates) */
  visibleErrorIds: Set<string>
  /** All error messages visible in the chat */
  errors: ErrorMessage[]
}

/**
 * Converts API/assistant errors rendered in the chat into toasts.
 * When an error is added to visibleMessages, this hook intercepts it and
 * displays it as a toast instead of a chat message block.
 */
export function useApiErrorToasts({
  visibleErrorIds,
  errors,
}: UseApiErrorToastsOptions) {
  const { showApiError, dismissApiError } = useErrorToast()
  const shownErrorIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    // Find errors that we should convert to toasts
    // These are errors that are visible in the chat (in visibleErrorIds)
    // but not yet shown as toasts (not in shownErrorIdsRef)
    const newErrors = errors.filter(
      (e) => visibleErrorIds.has(e.id) && !shownErrorIdsRef.current.has(e.id)
    )

    for (const error of newErrors) {
      showApiError(error)
      shownErrorIdsRef.current.add(error.id)
    }

    // Dismiss toasts for errors that are no longer in visible messages
    for (const id of shownErrorIdsRef.current) {
      if (!visibleErrorIds.has(id)) {
        dismissApiError(id)
        shownErrorIdsRef.current.delete(id)
      }
    }
  }, [errors, visibleErrorIds, showApiError, dismissApiError])
}
