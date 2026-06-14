/**
 * Update Check Store
 *
 * Persists the timestamp of the last background update check so the once-a-week
 * cadence survives app restarts. Persisted to localStorage via zustand.
 */

import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"

interface UpdateCheckState {
  lastCheckedAt: number
  markChecked: (at?: number) => void
}

export const useUpdateCheckStore = create<UpdateCheckState>()(
  persist(
    (set) => ({
      lastCheckedAt: 0,
      markChecked: (at = Date.now()) => set({ lastCheckedAt: at }),
    }),
    {
      name: "lambda_last_update_check",
      storage: createJSONStorage(() => localStorage),
    }
  )
)
