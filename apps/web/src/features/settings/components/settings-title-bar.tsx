import { type CSSProperties, useRef } from "react"
import { ArrowLeft, ChevronRight } from "lucide-react"
import { useParams, useRouter } from "@tanstack/react-router"

import { Button } from "@/shared/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip"
import { ShortcutKbd } from "@/shared/ui/kbd"
import { useShortcutBinding } from "@/shared/components/keyboard-shortcuts-provider"
import { SHORTCUT_ACTIONS } from "@/shared/lib/keyboard-shortcuts"
import { APP_SETTINGS_KEYS } from "@/shared/lib/storage-keys"
import { useWorkspace } from "@/features/workspace"
import { useElectronFullscreen, useElectronPlatform } from "@/features/electron"
import { cn } from "@/shared/lib/utils"
import { findSettingsSection } from "../sections"
import { useAppSettings } from "../queries"

/**
 * Island titlebar for the settings page — mirrors the workspace titlebar so the
 * window chrome reads consistently. Holds the "back to threads" control and the
 * page title; the rest of the bar is the draggable window strip.
 */
export function SettingsTitleBar() {
  const router = useRouter()
  const closeBinding = useShortcutBinding(SHORTCUT_ACTIONS.OPEN_SETTINGS)
  const { workspaces } = useWorkspace()
  const { data: settings } = useAppSettings()
  const { data: platform } = useElectronPlatform()
  const { data: isFullscreen = false } = useElectronFullscreen()
  const isMac = platform === "darwin"

  // Name of the section currently open, shown beside "Settings" in the title.
  const { section: slug } = useParams({ strict: false })
  const activeSection = slug ? findSettingsSection(slug) : undefined

  // Snapshot the thread that was active when settings opened, frozen so moving
  // between sections doesn't change where "back" returns to.
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
      router.navigate({ to: "/workspace/$threadId", params: { threadId } })
    } else {
      router.navigate({ to: "/" })
    }
  }

  const drag = { WebkitAppRegion: "drag" } as CSSProperties
  const noDrag = { WebkitAppRegion: "no-drag" } as CSSProperties

  return (
    <div
      className="fixed inset-x-2 top-2 z-50 flex h-9 items-center gap-1 overflow-hidden rounded-2xl border border-border bg-background pr-2 shadow-md"
      style={noDrag}
    >
      <div
        className={cn(
          "flex h-full shrink-0 items-center",
          isMac && !isFullscreen ? "pl-[4.75rem]" : "pl-1.5"
        )}
      >
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClose}
                aria-label="Go back"
                className="h-7 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="size-3.5" />
                <span className="text-xs font-medium">Back</span>
              </Button>
            }
          />
          <TooltipContent>
            Back to threads
            {closeBinding && <ShortcutKbd binding={closeBinding} className="ml-1" />}
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="mx-0.5 h-4 w-px shrink-0 bg-border" />

      <div className="flex min-w-0 shrink items-center gap-1">
        <span className="shrink-0 text-sm font-semibold text-foreground">
          Settings
        </span>
        {activeSection && (
          <>
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" />
            <span className="truncate text-sm font-medium text-muted-foreground">
              {activeSection.label}
            </span>
          </>
        )}
      </div>

      {/* Draggable filler — moves the frameless window. */}
      <div className="h-full min-w-4 flex-1" style={drag} />
    </div>
  )
}
