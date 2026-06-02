import { type ReactNode } from "react"

import { SettingsSidebar } from "./settings-sidebar"
import type { SettingsSectionMeta } from "../sections"

interface SettingsLayoutProps {
  children: ReactNode
}

export function SettingsLayout({ children }: SettingsLayoutProps) {
  return (
    <div className="flex h-svh w-full overflow-hidden bg-background">
      <SettingsSidebar />
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

interface SettingsContentProps {
  section: SettingsSectionMeta
  children: ReactNode
}

export function SettingsContent({ section, children }: SettingsContentProps) {
  const Icon = section.icon
  return (
    <div className="mx-auto w-full max-w-2xl px-8 pt-8 pb-24">
      <header className="mb-6 flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-card ring-1 ring-border">
          <Icon className="h-4 w-4 text-foreground/70" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-semibold leading-tight tracking-tight">
            {section.title}
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {section.description}
          </p>
        </div>
      </header>

      <div className="space-y-4">{children}</div>
    </div>
  )
}
