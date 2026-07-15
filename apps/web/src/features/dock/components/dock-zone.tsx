import { Suspense, lazy, useCallback, useMemo, useRef, useState } from "react"
import { LayoutGrid, Maximize2, Minimize2, Plus, X } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu"
import { Button } from "@/shared/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip"
import { useShortcutBinding } from "@/shared/components/keyboard-shortcuts-provider"
import { SHORTCUT_ACTIONS } from "@/shared/lib/keyboard-shortcuts"
import { ShortcutKbd } from "@/shared/ui/kbd"
import { useIsMobile } from "@/shared/hooks/use-mobile"
import { cn } from "@/shared/lib/utils"
import {
  selectReviewFile,
  useGitStatusByPath,
  type ChangedFile,
} from "@/features/git"
import { PANELS, openPanelInDock } from "../panels"
import { useDockStore } from "../store"
import type { DockId, DockPanelContext, DockTab } from "../types"

const FileTree = lazy(() =>
  import("@/features/file-tree").then((m) => ({ default: m.FileTree }))
)
const ModifiedFilesNavigator = lazy(() =>
  import("@/features/git").then((m) => ({
    default: m.ModifiedFilesNavigator,
  }))
)

const DOCK_TAB_MIME = "application/x-dock-tab"

// Panels that can host the file-tree drawer over their content.
function supportsFileTree(type: string): boolean {
  return type === "review" || type === "files"
}

interface DockZoneProps {
  dockId: DockId
  ctx: DockPanelContext
}

export function DockZone({ dockId, ctx }: DockZoneProps) {
  const dock = useDockStore((s) => s.docks[dockId])
  const tabs = useDockStore((s) => s.tabs)
  const setActiveTab = useDockStore((s) => s.setActiveTab)
  const closeTab = useDockStore((s) => s.closeTab)
  const moveTab = useDockStore((s) => s.moveTab)
  const reorderTab = useDockStore((s) => s.reorderTab)
  const fileTreeOpen = useDockStore((s) => s.fileTreeOpen)
  const toggleFileTree = useDockStore((s) => s.toggleFileTree)
  const fileTreeWidth = useDockStore((s) => s.fileTreeWidth)
  const setFileTreeWidth = useDockStore((s) => s.setFileTreeWidth)
  const reviewFilesWidth = useDockStore((s) => s.reviewFilesWidth)
  const setReviewFilesWidth = useDockStore((s) => s.setReviewFilesWidth)
  const rightDockFullscreen = useDockStore((s) => s.rightDockFullscreen)
  const toggleRightDockFullscreen = useDockStore(
    (s) => s.toggleRightDockFullscreen
  )
  const draggingTabId = useDockStore((s) => s.draggingTabId)
  const setDraggingTab = useDockStore((s) => s.setDraggingTab)

  const isMobile = useIsMobile(900)
  // The shortcut itself is registered once in workspace-layout.tsx (which
  // owns the dock layout) — this dock zone only reads the binding for the
  // tooltip hint on its own fullscreen button.
  const fullscreenBinding = useShortcutBinding(
    SHORTCUT_ACTIONS.TOGGLE_FULLSCREEN_DIFF
  )

  const dockTabs = useMemo(
    () => dock.tabIds.map((id) => tabs[id]).filter((t): t is DockTab => !!t),
    [dock.tabIds, tabs]
  )
  const activeTab = dock.activeTabId ? (tabs[dock.activeTabId] ?? null) : null
  const drawerWidth =
    activeTab?.type === "review" ? reviewFilesWidth : fileTreeWidth
  const availablePanels = Object.values(PANELS).filter(
    (def) =>
      def.singleton &&
      (!def.isAvailable || def.isAvailable(ctx)) &&
      !Object.values(tabs).some((tab) => tab.type === def.type)
  )

  // ── Cross-dock drag & drop (HTML5 DnD, mirrors main-tab-bar.tsx) ──────────
  const draggedTabId = useRef<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{
    id: string
    before: boolean
  } | null>(null)
  const [headerDropActive, setHeaderDropActive] = useState(false)
  const [contextMenuTabId, setContextMenuTabId] = useState<string | null>(null)

  const handleHeaderDragOver = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes(DOCK_TAB_MIME)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    setHeaderDropActive(true)
  }, [])
  const handleHeaderDrop = useCallback(
    (e: React.DragEvent) => {
      const id =
        e.dataTransfer.getData(DOCK_TAB_MIME) ||
        draggingTabId ||
        draggedTabId.current
      setHeaderDropActive(false)
      setDropTarget(null)
      if (!id) return
      e.preventDefault()
      moveTab(id, dockId)
      draggedTabId.current = null
      setDraggingTab(null)
    },
    [dockId, draggingTabId, moveTab, setDraggingTab]
  )

  // ── Git status for the file tree's changed-file badges ────────────────────
  const gitStatusByPath = useGitStatusByPath(ctx.workspaceSessionId ?? "")

  const handleSelectReviewFile = useCallback(
    (file: ChangedFile) => {
      selectReviewFile(file)
      toggleFileTree()
    },
    [toggleFileTree]
  )

  const fileTreeDrawerRef = useRef<HTMLDivElement>(null)
  const handleFileTreeResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const startX = e.clientX
      const startWidth = fileTreeDrawerRef.current?.offsetWidth ?? drawerWidth
      const onMove = (ev: MouseEvent) => {
        const next = Math.max(
          180,
          Math.min(560, startWidth + (startX - ev.clientX))
        )
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
          const width = fileTreeDrawerRef.current.offsetWidth
          if (activeTab?.type === "review") setReviewFilesWidth(width)
          else setFileTreeWidth(width)
        }
      }
      document.body.style.cursor = "col-resize"
      document.body.style.userSelect = "none"
      document.addEventListener("mousemove", onMove)
      document.addEventListener("mouseup", onUp)
    },
    [activeTab?.type, drawerWidth, setFileTreeWidth, setReviewFilesWidth]
  )

  const showFileTree =
    fileTreeOpen &&
    !!activeTab &&
    supportsFileTree(activeTab.type) &&
    !!ctx.workspaceId &&
    !!ctx.workspacePath

  // Dock is empty — full island chrome with a panel picker, so an opened
  // empty dock is still useful. Doubles as the drop target for a tab dragged
  // from the other dock (workspace-layout keeps us mounted during that drag).
  if (dockTabs.length === 0) {
    return (
      <div
        onDragOver={handleHeaderDragOver}
        onDragLeave={() => setHeaderDropActive(false)}
        onDrop={handleHeaderDrop}
        className={cn(
          "flex h-full w-full flex-col overflow-y-auto rounded-2xl border bg-background shadow-md transition-colors",
          headerDropActive ? "border-primary/60 bg-primary/5" : "border-border"
        )}
      >
        {/* m-auto (not justify-center) so the content scrolls instead of
            clipping at the top when the dock is shorter than the picker. */}
        <div className="m-auto flex w-full max-w-md flex-col items-center gap-4 px-4 py-6">
          <div className="flex flex-col items-center gap-2 text-center">
            <div
              className={cn(
                "flex size-10 items-center justify-center rounded-xl border transition-colors",
                headerDropActive
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border/60 bg-muted/60 text-muted-foreground"
              )}
            >
              <LayoutGrid className="size-4.5" aria-hidden />
            </div>
            <span className="text-sm font-medium">
              {headerDropActive ? "Drop tab here" : "No panels open"}
            </span>
            <p className="text-xs leading-relaxed text-balance text-muted-foreground">
              {headerDropActive
                ? "Release to move the tab into this dock."
                : "Open a panel to get started, or drag a tab here from another dock."}
            </p>
          </div>

          {availablePanels.length > 0 && (
            <div className="grid w-full grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-1.5">
              {availablePanels.map((def) => (
                <button
                  key={def.type}
                  type="button"
                  onClick={() => openPanelInDock(def.type, dockId, ctx)}
                  className="group flex flex-col items-start gap-1 rounded-lg border border-border/50 bg-muted/30 p-2 text-left transition-colors hover:border-border hover:bg-accent/60 focus-visible:border-border focus-visible:bg-accent/60 focus-visible:outline-none"
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors group-hover:bg-background group-hover:text-foreground">
                    {def.icon({ id: "", type: def.type, title: def.label })}
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-xs font-medium">{def.label}</span>
                    {def.description && (
                      <span className="text-2xs leading-snug text-muted-foreground">
                        {def.description}
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-md">
      <div
        className="flex h-11 shrink-0 items-center gap-1 overflow-hidden px-2 py-0"
        onDragOver={handleHeaderDragOver}
        onDragLeave={() => setHeaderDropActive(false)}
        onDrop={handleHeaderDrop}
      >
        <div
          className={cn(
            "flex min-w-0 flex-1 scrollbar-none items-center gap-1 self-stretch overflow-x-auto rounded-lg transition-colors",
            headerDropActive && "bg-primary/5 ring-1 ring-primary/40"
          )}
        >
          {dockTabs.map((tab) => {
            const def = PANELS[tab.type]
            const isActive = tab.id === dock.activeTabId
            const isDragging = draggingTabId === tab.id
            const dropBefore = dropTarget?.id === tab.id && dropTarget.before
            const dropAfter = dropTarget?.id === tab.id && !dropTarget.before
            return (
              <DropdownMenu
                key={tab.id}
                open={contextMenuTabId === tab.id}
                onOpenChange={(open) =>
                  setContextMenuTabId(open ? tab.id : null)
                }
              >
                <DropdownMenuTrigger
                  render={
                    <div
                      role="tab"
                      aria-selected={isActive}
                      draggable
                      onClick={() => setActiveTab(dockId, tab.id)}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        setContextMenuTabId(tab.id)
                      }}
                      onDragStart={(e) => {
                        draggedTabId.current = tab.id
                        setDraggingTab(tab.id)
                        e.dataTransfer.effectAllowed = "move"
                        e.dataTransfer.setData(DOCK_TAB_MIME, tab.id)
                        e.dataTransfer.setData("text/plain", tab.id)
                      }}
                      onDragEnd={() => {
                        draggedTabId.current = null
                        setDraggingTab(null)
                        setDropTarget(null)
                        setHeaderDropActive(false)
                      }}
                      onDragOver={(e) => {
                        if (!e.dataTransfer.types.includes(DOCK_TAB_MIME))
                          return
                        e.preventDefault()
                        e.stopPropagation()
                        e.dataTransfer.dropEffect = "move"
                        const rect = e.currentTarget.getBoundingClientRect()
                        const before = e.clientX < rect.left + rect.width / 2
                        setDropTarget({ id: tab.id, before })
                      }}
                      onDrop={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        const draggedId =
                          e.dataTransfer.getData(DOCK_TAB_MIME) ||
                          draggingTabId ||
                          draggedTabId.current
                        setHeaderDropActive(false)
                        if (draggedId && draggedId !== tab.id) {
                          const rect = e.currentTarget.getBoundingClientRect()
                          const before = e.clientX < rect.left + rect.width / 2
                          if (dock.tabIds.includes(draggedId)) {
                            reorderTab(dockId, draggedId, tab.id, before)
                          } else {
                            const targetIndex = dock.tabIds.indexOf(tab.id)
                            moveTab(
                              draggedId,
                              dockId,
                              before ? targetIndex : targetIndex + 1
                            )
                          }
                        }
                        draggedTabId.current = null
                        setDraggingTab(null)
                        setDropTarget(null)
                      }}
                      className={cn(
                        "group flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-md pr-1.5 pl-2.5 text-xs font-medium transition-all duration-150 select-none",
                        isActive
                          ? "bg-accent text-accent-foreground shadow-sm ring-1 ring-border/60"
                          : "text-muted-foreground/70 hover:bg-accent/60 hover:text-foreground",
                        isDragging && "opacity-40",
                        dropBefore && "border-l-2 border-primary",
                        dropAfter && "border-r-2 border-primary"
                      )}
                    >
                      {def?.icon(tab)}
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
                  }
                />
                <DropdownMenuContent align="start">
                  <DropdownMenuItem
                    disabled={dockId === "right"}
                    onClick={() => moveTab(tab.id, "right")}
                  >
                    Move to right panel
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={dockId === "bottom"}
                    onClick={() => moveTab(tab.id, "bottom")}
                  >
                    Move to bottom panel
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )
          })}

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="shrink-0 text-muted-foreground/60 hover:text-foreground"
                >
                  <Plus data-icon="inline-start" />
                  <span className="sr-only">Add panel</span>
                </Button>
              }
            />
            <DropdownMenuContent align="start">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Add panel</DropdownMenuLabel>
                {availablePanels.length > 0 ? (
                  availablePanels.map((def) => (
                    <DropdownMenuItem
                      key={def.type}
                      onClick={() => openPanelInDock(def.type, dockId, ctx)}
                    >
                      {def.icon({ id: "", type: def.type, title: def.label })}
                      {def.label}
                    </DropdownMenuItem>
                  ))
                ) : (
                  <DropdownMenuItem disabled>
                    No other panels available
                  </DropdownMenuItem>
                )}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          {activeTab && PANELS[activeTab.type]?.headerActions?.(activeTab, ctx)}
          {dockId === "right" && ctx.sessionId && !isMobile && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={toggleRightDockFullscreen}
                    className="size-7 text-muted-foreground/60 hover:bg-accent hover:text-foreground"
                  >
                    {rightDockFullscreen ? (
                      <Minimize2 className="size-3.5" />
                    ) : (
                      <Maximize2 className="size-3.5" />
                    )}
                    <span className="sr-only">
                      {rightDockFullscreen ? "Exit fullscreen" : "Fullscreen"}
                    </span>
                  </Button>
                }
              />
              <TooltipContent>
                {rightDockFullscreen ? "Exit fullscreen" : "Fullscreen"}
                <ShortcutKbd binding={fullscreenBinding} className="ml-1" />
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <div className="min-w-0 flex-1 overflow-hidden">
          {dockTabs.map((tab) => {
            const def = PANELS[tab.type]
            if (!def) return null
            const isActive = tab.id === dock.activeTabId
            if (!isActive && !def.keepAlive) return null
            return (
              <div
                key={tab.id}
                className="h-full w-full"
                style={{ display: isActive ? undefined : "none" }}
              >
                <Suspense fallback={<div className="h-full bg-background" />}>
                  {def.render(tab, ctx)}
                </Suspense>
              </div>
            )
          })}
        </div>

        {/* Files drawer — the workspace tree for Files, or a modified-files-only
            navigator for Review. A scrim dismisses the right-side overlay. */}
        {ctx.workspaceId &&
          ctx.workspacePath &&
          activeTab &&
          supportsFileTree(activeTab.type) && (
            <>
              <div
                aria-hidden
                onClick={toggleFileTree}
                className={cn(
                  "absolute inset-0 z-10 bg-background/50 transition-opacity duration-200",
                  showFileTree ? "opacity-100" : "pointer-events-none opacity-0"
                )}
              />
              <div
                ref={fileTreeDrawerRef}
                style={{ width: drawerWidth }}
                className={cn(
                  "absolute inset-y-2 right-2 z-20 flex max-w-[85%] flex-col overflow-hidden rounded-2xl border border-border bg-background p-1 shadow-md transition-transform duration-200 ease-out",
                  showFileTree && "translate-x-0",
                  !showFileTree &&
                    "pointer-events-none translate-x-[calc(100%+0.5rem)]"
                )}
              >
                <div
                  onMouseDown={handleFileTreeResizeStart}
                  className="group absolute inset-y-0 left-0 z-30 w-1.5 cursor-col-resize"
                >
                  <div className="absolute inset-y-0 left-0 w-px bg-transparent transition-colors group-hover:bg-border" />
                </div>
                <Suspense fallback={<div className="h-full bg-background" />}>
                  {activeTab.type === "review" ? (
                    <ModifiedFilesNavigator
                      sessionId={ctx.workspaceSessionId ?? ctx.sessionId ?? ""}
                      onSelectFile={handleSelectReviewFile}
                    />
                  ) : (
                    <FileTree
                      workspaceId={ctx.workspaceId}
                      workspacePath={ctx.workspacePath}
                      threadId={ctx.treeThreadId ?? undefined}
                      gitStatus={gitStatusByPath}
                    />
                  )}
                </Suspense>
              </div>
            </>
          )}
      </div>
    </div>
  )
}

export function useIsForeignDockDrag(dockId: DockId): boolean {
  const draggingTabId = useDockStore((s) => s.draggingTabId)
  const tabIds = useDockStore((s) => s.docks[dockId].tabIds)
  return draggingTabId !== null && !tabIds.includes(draggingTabId)
}
