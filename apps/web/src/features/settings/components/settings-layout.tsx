import { type CSSProperties, type ReactNode } from "react"

import { SidebarProvider } from "@/shared/ui/sidebar"
import { SettingsSidebar } from "./settings-sidebar"
import { SettingsTitleBar } from "./settings-title-bar"
import type { SettingsSectionMeta } from "../sections"

interface SettingsLayoutProps {
  children: ReactNode
}

export function SettingsLayout({ children }: SettingsLayoutProps) {
  return (
    <SidebarProvider
      style={{ "--sidebar-width": "15rem" } as CSSProperties}
      className="h-svh bg-sidebar"
    >
      {/* Draggable window strip behind the titlebar island (frameless window /
          macOS traffic lights). */}
      <div
        className="fixed inset-x-0 top-0 z-0 h-11"
        style={{ WebkitAppRegion: "drag" } as CSSProperties}
      />
      <SettingsTitleBar />
      <SettingsSidebar />
      <div className="relative z-20 flex min-w-0 flex-1 overflow-hidden pt-12 pr-2 pb-2 peer-data-[state=collapsed]:pl-2 max-md:pl-2">
        <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-md">
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </main>
      </div>
    </SidebarProvider>
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
