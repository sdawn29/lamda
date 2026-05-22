import React, { useEffect } from "react"
import { create } from "zustand"

interface SettingsModalContextValue {
  open: boolean
  openSettings: () => void
  closeSettings: () => void
}

interface SettingsModalStore extends SettingsModalContextValue {
  initialized: boolean
  setInitialized: (value: boolean) => void
}

const useSettingsModalStore = create<SettingsModalStore>((set) => ({
  initialized: false,
  open: false,
  openSettings: () => set({ open: true }),
  closeSettings: () => set({ open: false }),
  setInitialized: (value) => set({ initialized: value }),
}))

export function SettingsModalProvider({ children }: { children: React.ReactNode }) {
  const setInitialized = useSettingsModalStore((state) => state.setInitialized)
  useEffect(() => {
    setInitialized(true)
    return () => setInitialized(false)
  }, [setInitialized])
  return <>{children}</>
}

export function useSettingsModal() {
  const initialized = useSettingsModalStore((state) => state.initialized)
  const open = useSettingsModalStore((state) => state.open)
  const openSettings = useSettingsModalStore((state) => state.openSettings)
  const closeSettings = useSettingsModalStore((state) => state.closeSettings)
  if (!initialized) throw new Error("useSettingsModal must be used within SettingsModalProvider")
  return { open, openSettings, closeSettings }
}
