import { useCallback, useState } from "react"

import { useWorkspace } from "@/features/workspace"

/**
 * Drives the "Delete all data" reset end to end, across all three layers that
 * hold state:
 *
 * 1. Server — wipes the database, `~/.lamda`, managed worktrees, and the app's
 *    private git refs / tool approvals inside the user's repositories.
 * 2. Renderer — clears `localStorage`/`sessionStorage`, where the UI keeps its
 *    zustand-persisted preferences (dock layout, sidebar, notifications, …).
 *    Wiping only the server would leave those pointing at deleted threads.
 * 3. Desktop shell — clears the Electron `userData` preferences file and the
 *    renderer's web storage/caches.
 *
 * Finally the server is restarted (so nothing keeps stale in-memory state) and
 * the window reloads into a first-launch app.
 */
export function useResetAllData() {
  const { resetAll } = useWorkspace()
  const [resetting, setResetting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = useCallback(async (): Promise<boolean> => {
    setResetting(true)
    setError(null)
    try {
      await resetAll()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete application data"
      )
      setResetting(false)
      return false
    }

    // Past this point the data is already gone — every remaining step is
    // best-effort cleanup that must not strand the user on a half-reset UI.
    try {
      localStorage.clear()
      sessionStorage.clear()
    } catch {
      // Storage disabled or unavailable — nothing persisted to clear.
    }

    try {
      await window.electronAPI?.resetAppData?.()
    } catch {
      // Older shell without the handler, or the clear failed; reload anyway.
    }

    try {
      await window.electronAPI?.restartServer()
    } catch {
      // The reload below will surface an unreachable server on its own.
    }

    window.location.reload()
    return true
  }, [resetAll])

  return { reset, resetting, error }
}
