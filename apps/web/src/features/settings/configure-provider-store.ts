import { create } from "zustand"

export type ConfigureProviderTab = "subscriptions" | "api-keys"

interface ConfigureProviderStore {
  open: boolean
  tab: ConfigureProviderTab
  openConfigure: (tab?: ConfigureProviderTab) => void
  closeConfigure: () => void
  setTab: (tab: ConfigureProviderTab) => void
}

export const useConfigureProvider = create<ConfigureProviderStore>()((set) => ({
  open: false,
  tab: "subscriptions",
  openConfigure: (tab = "subscriptions") => set({ open: true, tab }),
  closeConfigure: () => set({ open: false }),
  setTab: (tab) => set({ tab }),
}))
