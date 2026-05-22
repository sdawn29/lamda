import React, { useEffect } from "react"
import { create } from "zustand"

export type ConfigureProviderTab = "subscriptions" | "api-keys"

interface ConfigureProviderContextValue {
  open: boolean
  tab: ConfigureProviderTab
  openConfigure: (tab?: ConfigureProviderTab) => void
  closeConfigure: () => void
  setTab: (tab: ConfigureProviderTab) => void
}

interface ConfigureProviderStore extends ConfigureProviderContextValue {
  initialized: boolean
  setInitialized: (value: boolean) => void
}

const useConfigureProviderStore = create<ConfigureProviderStore>((set) => ({
  initialized: false,
  open: false,
  tab: "subscriptions",
  openConfigure: (tab = "subscriptions") => set({ open: true, tab }),
  closeConfigure: () => set({ open: false }),
  setTab: (tab) => set({ tab }),
  setInitialized: (value) => set({ initialized: value }),
}))

export function ConfigureProviderProvider({ children }: { children: React.ReactNode }) {
  const setInitialized = useConfigureProviderStore((state) => state.setInitialized)
  useEffect(() => {
    setInitialized(true)
    return () => setInitialized(false)
  }, [setInitialized])
  return <>{children}</>
}

export function useConfigureProvider() {
  const initialized = useConfigureProviderStore((state) => state.initialized)
  const open = useConfigureProviderStore((state) => state.open)
  const tab = useConfigureProviderStore((state) => state.tab)
  const openConfigure = useConfigureProviderStore((state) => state.openConfigure)
  const closeConfigure = useConfigureProviderStore((state) => state.closeConfigure)
  const setTab = useConfigureProviderStore((state) => state.setTab)
  if (!initialized) throw new Error("useConfigureProvider must be used within ConfigureProviderProvider")
  return { open, tab, openConfigure, closeConfigure, setTab }
}
