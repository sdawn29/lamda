/**
 * Left Sidebar Store
 *
 * Durable open/collapsed state for the workspace's left sidebar (AppSidebar).
 * The shadcn SidebarProvider keeps this in internal state that resets to
 * `defaultOpen` on every reload; persisting it here lets the sidebar remember
 * whether the user left it open or collapsed. Persisted to localStorage via
 * zustand's `persist` middleware.
 */

import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"

interface LeftSidebarStore {
  isOpen: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
}

export const useLeftSidebarStore = create<LeftSidebarStore>()(
  persist(
    (set) => ({
      isOpen: true,
      setOpen: (open) => set({ isOpen: open }),
      toggle: () => set((s) => ({ isOpen: !s.isOpen })),
    }),
    {
      name: "layout:left-sidebar",
      storage: createJSONStorage(() => localStorage),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<LeftSidebarStore>
        const isOpen =
          typeof p.isOpen === "boolean" ? p.isOpen : current.isOpen
        return { ...current, isOpen }
      },
    }
  )
)
