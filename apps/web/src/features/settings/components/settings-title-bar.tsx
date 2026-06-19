import { type CSSProperties, useRef } from "react"
import { ArrowLeft } from "lucide-react"
import { useRouter } from "@tanstack/react-router"

import { Button } from "@/shared/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip"
import { ShortcutKbd } from "@/shared/ui/kbd"
import { useShortcutBinding } from "@/shared/components/keyboard-shortcuts-provider"
import { SHORTCUT_ACTIONS } from "@/shared/lib/keyboard-shortcuts"
import { APP_SETTINGS_KEYS } from "@/shared/lib/storage-keys"
import { useWorkspace } from "@/features/workspace"
import { useElectronFullscreen, useElectronPlatform } from "@/features/electron"
import { cn } from "@/shared/lib/utils"
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

      <span className="shrink-0 text-sm font-semibold text-foreground">
        Settings
      </span>

      {/* Draggable filler — moves the frameless window. */}
      <div className="h-full min-w-4 flex-1" style={drag} />
    </div>
  )
}
