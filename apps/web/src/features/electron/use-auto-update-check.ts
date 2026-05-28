import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { checkForUpdates } from "./api"
import { electronKeys } from "./queries"

const STORAGE_KEY = "lambda_last_update_check"
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Automatically checks for updates once per week (on mount, in Electron only).
 * The last-checked timestamp is persisted in localStorage so the cadence
 * survives app restarts without requiring a server round-trip.
 */
export function useAutoUpdateCheck() {
  const queryClient = useQueryClient()

  useEffect(() => {
    // Only run inside Electron.
    if (!window.electronAPI) return

    const raw = localStorage.getItem(STORAGE_KEY)
    const lastChecked = raw ? Number(raw) : 0
    const now = Date.now()

    if (now - lastChecked < ONE_WEEK_MS) return

    // Enough time has elapsed — fire a check in the background.
    checkForUpdates()
      .then((status) => {
        queryClient.setQueryData(electronKeys.updateStatus, status)
        localStorage.setItem(STORAGE_KEY, String(Date.now()))
      })
      .catch(() => {
        // Silently ignore network/API errors for the background check.
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally runs only once per mount
}
