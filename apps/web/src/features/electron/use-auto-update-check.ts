import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { checkForUpdates } from "./api"
import { electronKeys } from "./queries"
import { useUpdateCheckStore } from "./update-check-store"

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Automatically checks for updates once per week (on mount, in Electron only).
 * The last-checked timestamp is persisted (via the update-check zustand store)
 * so the cadence survives app restarts without requiring a server round-trip.
 */
export function useAutoUpdateCheck() {
  const queryClient = useQueryClient()

  useEffect(() => {
    // Only run inside Electron.
    if (!window.electronAPI) return

    const { lastCheckedAt, markChecked } = useUpdateCheckStore.getState()
    const now = Date.now()

    if (now - lastCheckedAt < ONE_WEEK_MS) return

    // Enough time has elapsed — fire a check in the background.
    checkForUpdates()
      .then((status) => {
        queryClient.setQueryData(electronKeys.updateStatus, status)
        markChecked()
      })
      .catch(() => {
        // Silently ignore network/API errors for the background check.
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally runs only once per mount
}
