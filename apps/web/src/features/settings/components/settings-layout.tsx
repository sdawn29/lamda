import type React from "react"
import { useRef, type ReactNode } from "react"
import { ArrowLeft } from "lucide-react"
import { useRouter } from "@tanstack/react-router"

import { Button } from "@/shared/ui/button"
import { ShortcutKbd } from "@/shared/ui/kbd"
import { useShortcutBinding } from "@/shared/components/keyboard-shortcuts-provider"
import { SHORTCUT_ACTIONS } from "@/shared/lib/keyboard-shortcuts"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip"
import { useWorkspace } from "@/features/workspace"
import { useAppSettings } from "../queries"
import { APP_SETTINGS_KEYS } from "@/shared/lib/storage-keys"
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
        <ChromeBar />
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

function ChromeBar() {
  const router = useRouter()
  const closeBinding = useShortcutBinding(SHORTCUT_ACTIONS.OPEN_SETTINGS)
  const { workspaces } = useWorkspace()
  const { data: settings } = useAppSettings()

  // Snapshot the thread that was active when settings was opened. Captured on
  // first render and frozen so navigating between sections doesn't change it.
  const initialThreadIdRef = useRef<string | null>(null)
  if (initialThreadIdRef.current === null) {
    const saved = settings?.[APP_SETTINGS_KEYS.ACTIVE_THREAD_ID]
    if (typeof saved === "string" && saved) {
      initialThreadIdRef.current = saved
    }
  }

  const handleClose = () => {
    const threadId = initialThreadIdRef.current
    const allThreads = workspaces.flatMap((w) => w.threads)
    const exists = threadId && allThreads.some((t) => t.id === threadId)
    if (exists && threadId) {
      router.navigate({
        to: "/workspace/$threadId",
        params: { threadId },
      })
    } else {
      router.navigate({ to: "/" })
    }
  }

  return (
    <div
      className="sticky top-0 z-20 flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border/60 bg-background px-2"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <div
        className="flex items-center gap-1"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClose}
                aria-label="Back to threads"
                className="h-7 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="size-3.5" />
                <span className="text-xs font-medium">Threads</span>
              </Button>
            }
          />
          <TooltipContent>
            Back to threads
            {closeBinding && (
              <ShortcutKbd binding={closeBinding} className="ml-1" />
            )}
          </TooltipContent>
        </Tooltip>
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
