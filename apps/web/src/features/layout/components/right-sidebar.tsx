import { lazy, Suspense } from "react"
import { FileDiff, FolderTree, Maximize2, Minimize2, X } from "lucide-react"
import { Icon } from "@iconify/react"
import { getIconName } from "@/shared/ui/file-icon"
import { Button } from "@/shared/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip"
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
} from "@/shared/ui/sidebar"
import { Sheet, SheetContent } from "@/shared/ui/sheet"
import { useRightSidebar } from "../store/right-sidebar"
import { useDiffPanel } from "@/features/git"
import { useMainTabs } from "@/features/main-tabs"
import { useShortcutBinding } from "@/shared/components/keyboard-shortcuts-provider"
import { SHORTCUT_ACTIONS } from "@/shared/lib/keyboard-shortcuts"
import { ShortcutKbd } from "@/shared/ui/kbd"
import { cn } from "@/shared/lib/utils"
import { useIsMobile } from "@/shared/hooks/use-mobile"

const DiffPanel = lazy(() =>
  import("@/features/git").then((m) => ({ default: m.DiffPanel }))
)

const FileTree = lazy(() =>
  import("@/features/file-tree").then((m) => ({ default: m.FileTree }))
)

interface RightSidebarProps {
  sessionId: string | null
  workspaceSessionId?: string | null
  openWithAppId?: string | null
  workspaceId?: string | null
  workspacePath?: string | null
}

export function RightSidebarContent({
  sessionId,
  workspaceSessionId,
  openWithAppId,
  workspaceId,
  workspacePath,
}: RightSidebarProps) {
  const { isFileTreeOpen, toggleFileTree, isOpen, close } = useRightSidebar()
  const { isFullscreen, toggleFullscreen } = useDiffPanel()
  const isMobile = useIsMobile(900)
  const fullscreenBinding = useShortcutBinding(SHORTCUT_ACTIONS.TOGGLE_FULLSCREEN_DIFF)
  const fileTreeBinding = useShortcutBinding(SHORTCUT_ACTIONS.TOGGLE_FILE_TREE)
  const { tabs, activeTabId, setActiveTab, closeTab, clearActiveTab } = useMainTabs()
  const fileTabs = tabs.filter((t) => t.type === "file")
  const isChangesActive = !fileTabs.some((t) => t.id === activeTabId)

  const sidebarEl = (
    <Sidebar side="right" collapsible="none" className="h-full w-full">
      <SidebarHeader className="h-11 flex-row items-center gap-1 overflow-hidden pl-2 pr-11 py-0">
        {/* Changes tab */}
        <button
          type="button"
          onClick={clearActiveTab}
          className={cn(
            "flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium select-none transition-all duration-150",
            isChangesActive
              ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm ring-1 ring-border/60"
              : "text-sidebar-foreground/60 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
          )}
        >
          <FileDiff className="size-3.5 shrink-0" aria-hidden />
          Review
        </button>

        {fileTabs.length > 0 && <div className="mx-0.5 h-4 w-px shrink-0 bg-border/50" />}

        {/* File tabs */}
        <div className="scrollbar-none flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {fileTabs.map((tab) => {
            const isActive = tab.id === activeTabId
            return (
              <div
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "group flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-md pl-2.5 pr-1.5 text-xs select-none transition-all duration-150",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm ring-1 ring-border/60"
                    : "text-sidebar-foreground/60 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                )}
              >
                <Icon
                  icon={`catppuccin:${getIconName(tab.title)}`}
                  className="size-3.5 shrink-0"
                  aria-hidden
                />
                <span className="max-w-28 truncate">{tab.title}</span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Close ${tab.title}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    closeTab(tab.id)
                  }}
                  className={cn(
                    "ml-auto shrink-0 text-sidebar-foreground/50",
                    isActive
                      ? "opacity-60 hover:opacity-100"
                      : "opacity-0 group-hover:opacity-60 group-hover:hover:opacity-100"
                  )}
                >
                  <X className="h-2.5 w-2.5" />
                </Button>
              </div>
            )
          })}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          {workspaceId && workspacePath && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={toggleFileTree}
                    className="size-7 text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground aria-pressed:bg-sidebar-accent aria-pressed:text-sidebar-foreground"
                    aria-pressed={isFileTreeOpen}
                  >
                    <FolderTree className="size-3.5" />
                    <span className="sr-only">Toggle file tree</span>
                  </Button>
                }
              />
              <TooltipContent>
                Toggle file tree
                <ShortcutKbd binding={fileTreeBinding} className="ml-1" />
              </TooltipContent>
            </Tooltip>
          )}
          {sessionId && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={toggleFullscreen}
                    className="size-7 text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  >
                    {isFullscreen ? (
                      <Minimize2 className="size-3.5" />
                    ) : (
                      <Maximize2 className="size-3.5" />
                    )}
                    <span className="sr-only">
                      {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                    </span>
                  </Button>
                }
              />
              <TooltipContent>
                {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                <ShortcutKbd binding={fullscreenBinding} className="ml-1" />
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="overflow-hidden p-0">
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="min-w-0 flex-1 overflow-hidden">
            {sessionId ? (
              <Suspense fallback={<div className="h-full bg-sidebar" />}>
                <DiffPanel
                  sessionId={sessionId}
                  workspaceSessionId={workspaceSessionId ?? sessionId}
                  openWithAppId={openWithAppId}
                  isEmbedded
                />
              </Suspense>
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-sidebar-foreground/40">
                No active session
              </div>
            )}
          </div>

          {isFileTreeOpen && workspaceId && workspacePath && (
            <div className="w-64 shrink-0 overflow-hidden p-1 pl-0">
              <Suspense fallback={<div className="h-full bg-sidebar" />}>
                <FileTree workspaceId={workspaceId} workspacePath={workspacePath} />
              </Suspense>
            </div>
          )}
        </div>
      </SidebarContent>
    </Sidebar>
  )

  if (isMobile) {
    return (
      <Sheet open={isOpen} onOpenChange={(open) => { if (!open) close() }}>
        <SheetContent
          side="right"
          showCloseButton={false}
          className="bg-sidebar p-0 text-sidebar-foreground sm:max-w-none"
          style={{ width: "90vw", maxWidth: "90vw" }}
        >
          {sidebarEl}
        </SheetContent>
      </Sheet>
    )
  }

  return sidebarEl
}
