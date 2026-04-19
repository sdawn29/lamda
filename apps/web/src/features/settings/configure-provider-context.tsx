import React, { createContext, useContext, useState } from "react"

export type ConfigureProviderTab = "subscriptions" | "api-keys"

interface ConfigureProviderContextValue {
  open: boolean
  tab: ConfigureProviderTab
  openConfigure: (tab?: ConfigureProviderTab) => void
  closeConfigure: () => void
  setTab: (tab: ConfigureProviderTab) => void
}

const ConfigureProviderContext = createContext<ConfigureProviderContextValue | null>(null)

export function ConfigureProviderProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<ConfigureProviderTab>("subscriptions")

  return (
    <ConfigureProviderContext.Provider
      value={{
        open,
        tab,
        openConfigure: (t = "subscriptions") => {
          setTab(t)
          setOpen(true)
        },
        closeConfigure: () => setOpen(false),
        setTab,
      }}
    >
      {children}
    </ConfigureProviderContext.Provider>
  )
}

export function useConfigureProvider() {
  const ctx = useContext(ConfigureProviderContext)
  if (!ctx) throw new Error("useConfigureProvider must be used within ConfigureProviderProvider")
  return ctx
}
