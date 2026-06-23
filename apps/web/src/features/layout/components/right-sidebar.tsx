import { lazy, Suspense, useCallback, useMemo, useRef } from "react"
import {
  FileDiff,
  FolderTree,
  History,
  Maximize2,
  Minimize2,
  X,
} from "lucide-react"
import { Icon } from "@iconify/react"
import { getIconName } from "@/shared/ui/file-icon"
import { Button } from "@/shared/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip"
import { Sidebar, SidebarContent, SidebarHeader } from "@/shared/ui/sidebar"
import { Sheet, SheetContent } from "@/shared/ui/sheet"
import { useRightSidebar } from "../store/right-sidebar"
import {
  useReviewPanel,
  useGitStatus,
  parseStatusLines,
  statusLabel,
  statusTextClass,
} from "@/features/git"
import { useMainTabs } from "@/features/main-tabs"
import { useShortcutBinding } from "@/shared/components/keyboard-shortcuts-provider"
import { SHORTCUT_ACTIONS } from "@/shared/lib/keyboard-shortcuts"
import { ShortcutKbd } from "@/shared/ui/kbd"
import { cn } from "@/shared/lib/utils"
import { useIsMobile } from "@/shared/hooks/use-mobile"

const ReviewPanel = lazy(() =>
  import("@/features/git").then((m) => ({ default: m.ReviewPanel }))
)

const FileTree = lazy(() =>
  import("@/features/file-tree").then((m) => ({ default: m.FileTree }))
)

const HistoryView = lazy(() =>
  import("@/features/git").then((m) => ({ default: m.HistoryView }))
)

interface RightSidebarProps {
  sessionId: string | null
  workspaceSessionId?: string | null
  openWithAppId?: string | null
  workspaceId?: string | null
  workspacePath?: string | null
  /** Active thread id — lets the file tree read the thread's worktree dir. */
  treeThreadId?: string | null
}

export function RightSidebarContent({
  sessionId,
  workspaceSessionId,
  openWithAppId,
  workspaceId,
  workspacePath,
  treeThreadId,
}: RightSidebarProps) {
  const {
    isFileTreeOpen,
    toggleFileTree,
    isOpen,
    close,
    fileTreeWidth,
    setFileTreeWidth,
  } = useRightSidebar()
  const { isFullscreen, toggleFullscreen } = useReviewPanel()
  const isMobile = useIsMobile(900)
  const fullscreenBinding = useShortcutBinding(
    SHORTCUT_ACTIONS.TOGGLE_FULLSCREEN_DIFF
  )
  const fileTreeBinding = useShortcutBinding(SHORTCUT_ACTIONS.TOGGLE_FILE_TREE)
  const { tabs, activeTabId, activeTab, setActiveTab, closeTab, clearActiveTab } =
    useMainTabs()
  const fileTabs = tabs.filter((t) => t.type === "file")
  const isChangesActive = !fileTabs.some((t) => t.id === activeTabId)
  const hasActiveFileTab = activeTab?.type === "file"

  // File tree drawer width — drag its left edge to resize. Update the element
  // directly during the drag (no React re-renders), then commit to the store on
  // release. The drawer is right-anchored, so dragging left widens it.
  const fileTreeDrawerRef = useRef<HTMLDivElement>(null)
  const handleFileTreeResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const startX = e.clientX
      const startWidth = fileTreeDrawerRef.current?.offsetWidth ?? 256
      const onMove = (ev: MouseEvent) => {
        const next = Math.max(180, Math.min(560, startWidth + (startX - ev.clientX)))
        if (fileTreeDrawerRef.current) {
          fileTreeDrawerRef.current.style.width = `${next}px`
        }
      }
      const onUp = () => {
        document.removeEventListener("mousemove", onMove)
        document.removeEventListener("mouseup", onUp)
        document.body.style.cursor = ""
        document.body.style.userSelect = ""
        if (fileTreeDrawerRef.current) {
          setFileTreeWidth(fileTreeDrawerRef.current.offsetWidth)
        }
      }
      document.body.style.cursor = "col-resize"
      document.body.style.userSelect = "none"
      document.addEventListener("mousemove", onMove)
      document.addEventListener("mouseup", onUp)
    },
    [setFileTreeWidth]
  )

  // Git status per path, fed to the file tree so changed files are highlighted
  // with their status letter/colour. Keyed by repo-relative path, which matches
  // the tree's entry.relativePath (both resolve against the same root).
  const { data: gitStatusData } = useGitStatus(workspaceSessionId ?? "")
  const gitStatusByPath = useMemo(() => {
    const map = new Map<string, { label: string; className: string }>()
    for (const file of parseStatusLines(gitStatusData?.raw ?? "")) {
      const label = statusLabel(file)
      map.set(file.filePath, { label, className: statusTextClass(label) })
    }
    return map
  }, [gitStatusData])

  const sidebarEl = (
    <Sidebar
      side="right"
      collapsible="none"
      className="h-full w-full overflow-hidden rounded-2xl border border-border bg-background shadow-md"
    >
      <SidebarHeader className="h-11 flex-row items-center gap-1 overflow-hidden px-2 py-0">
        {/* Review (changes) tab */}
        <button
          type="button"
          onClick={clearActiveTab}
          className={cn(
            "flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium select-none transition-all duration-150",
            isChangesActive
              ? "bg-accent text-accent-foreground shadow-sm ring-1 ring-border/60"
              : "text-muted-foreground/70 hover:bg-accent/60 hover:text-foreground"
          )}
        >
          <FileDiff className="size-3.5 shrink-0" aria-hidden />
          Review
        </button>

        {fileTabs.length > 0 && (
          <div className="mx-0.5 h-4 w-px shrink-0 bg-border/50" />
        )}

        {/* Open file tabs */}
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
                    ? "bg-accent text-accent-foreground shadow-sm ring-1 ring-border/60"
                    : "text-muted-foreground/70 hover:bg-accent/60 hover:text-foreground"
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
                    "ml-auto shrink-0 text-muted-foreground/50",
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

        {/* Panel controls */}
        <div className="flex shrink-0 items-center gap-0.5">
          {workspaceId && workspacePath && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={toggleFileTree}
                    aria-pressed={isFileTreeOpen}
                    className="size-7 text-muted-foreground/60 hover:bg-accent hover:text-foreground aria-pressed:bg-accent aria-pressed:text-accent-foreground"
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
          {sessionId && !isMobile && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={toggleFullscreen}
                    className="size-7 text-muted-foreground/60 hover:bg-accent hover:text-foreground"
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
        {/* Review / history fills the panel body; the file tree opens over it
            as a right-anchored drawer (see below). */}
        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          <div className="min-w-0 flex-1 overflow-hidden">
            {(sessionId || hasActiveFileTab) ? (
              <Suspense fallback={<div className="h-full bg-background" />}>
                <ReviewPanel
                  sessionId={sessionId ?? ""}
                  workspaceSessionId={workspaceSessionId ?? sessionId ?? ""}
                  openWithAppId={openWithAppId}
                  isEmbedded
                />
              </Suspense>
            ) : workspaceId ? (
              // No live session — fall back to workspace-level commit history
              // so the panel is still useful on the new-thread page.
              <div className="flex h-full flex-col">
                <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-border/40 px-3 text-xs font-medium text-sidebar-foreground/70">
                  <History className="size-3.5" />
                  Commit history
                </div>
                <Suspense fallback={<div className="h-full bg-background" />}>
                  <HistoryView sessionId="" workspaceId={workspaceId} />
                </Suspense>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-sidebar-foreground/40">
                No active session
              </div>
            )}
          </div>

          {/* File tree — a sidebar drawer that slides in from the right edge of
              the panel, overlaying the review content. A scrim dismisses it.
              Kept mounted so it animates in/out and opens instantly. */}
          {workspaceId && workspacePath && (
            <>
              <div
                aria-hidden
                onClick={toggleFileTree}
                className={cn(
                  "absolute inset-0 z-10 bg-background/50 transition-opacity duration-200",
                  isFileTreeOpen
                    ? "opacity-100"
                    : "pointer-events-none opacity-0"
                )}
              />
              <div
                ref={fileTreeDrawerRef}
                style={{ width: fileTreeWidth }}
                className={cn(
                  "absolute inset-y-2 right-2 z-20 flex max-w-[85%] flex-col overflow-hidden rounded-2xl border border-border bg-background p-1 shadow-md transition-transform duration-200 ease-out",
                  isFileTreeOpen
                    ? "translate-x-0"
                    : "pointer-events-none translate-x-[calc(100%+0.5rem)]"
                )}
              >
                {/* Resize handle — drag the drawer's left edge to widen it. */}
                <div
                  onMouseDown={handleFileTreeResizeStart}
                  className="group absolute inset-y-0 left-0 z-30 w-1.5 cursor-col-resize"
                >
                  <div className="absolute inset-y-0 left-0 w-px bg-transparent transition-colors group-hover:bg-border" />
                </div>
                <Suspense fallback={<div className="h-full bg-background" />}>
                  <FileTree
                    workspaceId={workspaceId}
                    workspacePath={workspacePath}
                    threadId={treeThreadId}
                    gitStatus={gitStatusByPath}
                  />
                </Suspense>
              </div>
            </>
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
          style={{ width: "80vw", maxWidth: "80vw" }}
        >
          {sidebarEl}
        </SheetContent>
      </Sheet>
    )
  }

  return sidebarEl
}
