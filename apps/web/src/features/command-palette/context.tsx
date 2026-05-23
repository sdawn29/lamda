import React, { useEffect } from "react"
import { create } from "zustand"

interface CommandPaletteContextValue {
  open: boolean
  openPalette: () => void
  closePalette: () => void
}

interface CommandPaletteStore extends CommandPaletteContextValue {
  initialized: boolean
  setInitialized: (value: boolean) => void
}

const useCommandPaletteStore = create<CommandPaletteStore>((set) => ({
  initialized: false,
  open: false,
  openPalette: () => set({ open: true }),
  closePalette: () => set({ open: false }),
  setInitialized: (value) => set({ initialized: value }),
}))

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const setInitialized = useCommandPaletteStore((state) => state.setInitialized)
  useEffect(() => {
    setInitialized(true)
    return () => setInitialized(false)
  }, [setInitialized])
  return <>{children}</>
}

export function useCommandPalette() {
  const initialized = useCommandPaletteStore((state) => state.initialized)
  const open = useCommandPaletteStore((state) => state.open)
  const openPalette = useCommandPaletteStore((state) => state.openPalette)
  const closePalette = useCommandPaletteStore((state) => state.closePalette)
  if (!initialized) throw new Error("useCommandPalette must be used within CommandPaletteProvider")
  return { open, openPalette, closePalette }
}
