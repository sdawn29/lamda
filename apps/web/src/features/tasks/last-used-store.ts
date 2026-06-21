import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"

interface LastUsedTaskStore {
  /** Per-workspace last-run task id, keyed by workspace id. */
  lastUsed: Record<string, string>
  setLastUsed: (workspaceId: string, taskId: string) => void
}

/**
 * Remembers the most recently run task for each workspace so the Tasks button
 * in the title bar can surface it as a one-click default (mirroring how the
 * "Open with" button surfaces the last-used app). Persisted to localStorage.
 */
export const useLastUsedTaskStore = create<LastUsedTaskStore>()(
  persist(
    (set) => ({
      lastUsed: {},
      setLastUsed: (workspaceId, taskId) =>
        set((s) => ({
          lastUsed: { ...s.lastUsed, [workspaceId]: taskId },
        })),
    }),
    {
      name: "tasks:last-used",
      storage: createJSONStorage(() => localStorage),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<LastUsedTaskStore>
        const lastUsed =
          p.lastUsed && typeof p.lastUsed === "object"
            ? p.lastUsed
            : current.lastUsed
        return { ...current, lastUsed }
      },
    }
  )
)
