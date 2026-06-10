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
  return (
    <div className="mx-auto w-full max-w-2xl px-8 pt-12 pb-24">
      <header className="border-b border-border/60 pb-5">
        <h1 className="text-lg font-semibold tracking-tight">
          {section.title}
        </h1>
        <p className="mt-1 text-xs/relaxed text-muted-foreground">
          {section.description}
        </p>
      </header>

      <div className="flex flex-col gap-9 pt-5">{children}</div>
    </div>
  )
}
