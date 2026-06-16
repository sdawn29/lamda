import React, { useState, useCallback, useEffect, useRef, memo } from "react"
import {
  Archive,
  ExternalLink,
  Folder,
  FolderOpen,
  FolderPlus,
  KeyRound,
  Loader2,
  MessageSquarePlus,
  MessagesSquare,
  MoreHorizontal,
  Pin,
  Search,
  Settings,
  Trash2,
} from "lucide-react"
import { useNavigate, useParams } from "@tanstack/react-router"
import {
  useShortcutHandler,
  useShortcutBinding,
} from "@/shared/components/keyboard-shortcuts-provider"
import { SHORTCUT_ACTIONS } from "@/shared/lib/keyboard-shortcuts"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/shared/ui/tooltip"
import { IconButtonWithTooltip } from "@/shared/ui/icon-button-with-tooltip"
import { ShortcutKbd } from "@/shared/ui/kbd"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/shared/ui/sidebar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu"
import { useOpenPath, useOpenWorkspaceWithApp } from "@/features/electron"
import { Button } from "@/shared/ui/button"
import { apiUrl } from "@/shared/lib/client"
import { cn } from "@/shared/lib/utils"
import { useTheme } from "@/shared/components/theme-provider"
import { useWorkspace, useCreateWorkspaceAction } from "../context"
import { useThreadStatus } from "@/features/chat"
import type { Thread } from "../context"
import { DEFAULT_SETTINGS_SECTION } from "@/features/settings"
import { useMainTabs } from "@/features/main-tabs"
import { useCommandPalette } from "@/features/command-palette"
import { ArchivedThreadsDialog } from "./archived-threads-dialog"
import { FeedbackDialog } from "./feedback-dialog"
import { CreateWorkspaceDialog } from "./create-workspace-dialog"
import { WorkspaceEnvDialog } from "./workspace-env-dialog"
import { useEnvDialog } from "../env-dialog-store"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/shared/ui/alert-dialog"

function relativeTime(ts: number, now = Date.now()): string {
  // `now` only ticks every 60s, so a just-created timestamp can be slightly
  // ahead of it — clamp to 0 instead of rendering a negative age.
  const diff = Math.max(0, Math.floor((now - ts) / 1000))
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

function useNow() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])
  return now
}

// Average luminance (0..1) of each icon's opaque pixels, keyed by src, so
// re-renders and re-mounts don't re-fetch and re-sample. null = unknown
// (load/CORS failure) — treated as "leave the icon as-is".
const iconLuminanceCache = new Map<string, number | null>()

function useIconLuminance(src: string | null): number | null {
  const [luminance, setLuminance] = useState<number | null>(() =>
    src ? (iconLuminanceCache.get(src) ?? null) : null
  )
  useEffect(() => {
    if (!src) return
    if (iconLuminanceCache.has(src)) {
      setLuminance(iconLuminanceCache.get(src) ?? null)
      return
    }
    let cancelled = false
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      if (cancelled) return
      let result: number | null = null
      try {
        const size = 16
        const canvas = document.createElement("canvas")
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext("2d")
        if (ctx) {
          ctx.drawImage(img, 0, 0, size, size)
          const { data } = ctx.getImageData(0, 0, size, size)
          let sum = 0
          let count = 0
          for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] < 32) continue
            sum +=
              0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
            count++
          }
          if (count > 0) result = sum / count / 255
        }
      } catch {
        // Tainted canvas (icon served without CORS) — luminance stays unknown.
      }
      iconLuminanceCache.set(src, result)
      setLuminance(result)
    }
    img.onerror = () => {
      if (!cancelled) iconLuminanceCache.set(src, null)
    }
    img.src = src
    return () => {
      cancelled = true
    }
  }, [src])
  return luminance
}

function WorkspaceIcon({
  workspaceId,
  icon,
  isCollapsed,
}: {
  workspaceId: string
  icon: string | null
  isCollapsed: boolean
}) {
  const { resolvedTheme } = useTheme()
  const FallbackIcon = isCollapsed ? Folder : FolderOpen
  let src: string | null = null
  if (icon) {
    try {
      src = apiUrl(`/workspace/${workspaceId}/icon`)
    } catch {
      src = null
    }
  }
  const luminance = useIconLuminance(src)
  if (!src) return <FallbackIcon className="size-3.5 shrink-0 text-muted-foreground/60" />
  // Icons whose brightness is close to the sidebar background (black logo on a
  // dark theme, white logo on a light theme) get a contrasting backdrop chip.
  const needsBackdrop =
    luminance !== null &&
    (resolvedTheme === "dark" ? luminance < 0.25 : luminance > 0.75)
  return (
    <img
      src={src}
      alt=""
      className={cn(
        "size-3.5 shrink-0 rounded-[2px] object-contain",
        needsBackdrop && (resolvedTheme === "dark" ? "bg-white/90 p-px" : "bg-zinc-800/90 p-px")
      )}
      onError={(e) => {
        // Fallback: hide the broken image — the parent text label is still visible.
        ;(e.currentTarget as HTMLImageElement).style.display = "none"
      }}
    />
  )
}

const ThreadRow = memo(function ThreadRow({
  thread,
  workspaceId,
  isActive,
  depth = 0,
  onClick,
}: {
  thread: Thread
  workspaceId: string
  isActive: boolean
  depth?: number
  onClick: () => void
}) {
  const now = useNow()
  const [confirming, setConfirming] = useState(false)
  const status = useThreadStatus(thread.id)
  const { archiveThread, pinThread, unpinThread } = useWorkspace()
  const rowRef = useRef<HTMLLIElement>(null)

  useEffect(() => {
    if (isActive) {
      rowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
    }
  }, [isActive])

  const handlePinToggle = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
      try {
        if (thread.isPinned) {
          await unpinThread(workspaceId, thread.id)
        } else {
          await pinThread(workspaceId, thread.id)
        }
      } catch (err) {
        console.error("Failed to toggle pin:", err)
      }
    },
    [thread.isPinned, thread.id, workspaceId, unpinThread, pinThread]
  )

  const handleArchiveClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setConfirming(true)
  }, [])

  const isForked = depth > 0

  return (
    <>
      <SidebarMenuSubItem
        ref={rowRef}
        className="group/thread"
        style={isForked ? { marginLeft: `${depth * 12}px`, borderLeft: "1px solid hsl(var(--border) / 0.4)", paddingLeft: "4px" } : undefined}
      >
        <SidebarMenuSubButton isActive={isActive} onClick={onClick}>
          <span className="flex h-4 w-4 shrink-0 items-center justify-center">
            <span className="flex h-4 w-4 items-center justify-center group-hover/thread:hidden">
              {status === "awaiting" ? (
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500/70" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
                </span>
              ) : status === "streaming" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground/60" />
              ) : status === "completed" ? (
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              ) : status === "error" ? (
                <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
              ) : thread.isPinned ? (
                <Pin className="h-3 w-3 text-muted-foreground/40" />
              ) : null}
            </span>
            <IconButtonWithTooltip
              icon={Pin}
              label={thread.isPinned ? "Unpin thread" : "Pin thread"}
              onClick={handlePinToggle}
              className="hidden size-auto text-muted-foreground/40 transition-colors group-hover/thread:flex"
            />
          </span>
          <span className="min-w-0 truncate">{thread.title}</span>
          <div className="ml-auto grid shrink-0 items-center justify-items-end">
            <span className="col-start-1 row-start-1 text-xs text-muted-foreground/50 group-hover/thread:invisible">
              {relativeTime(thread.updatedAt, now)}
            </span>
            <IconButtonWithTooltip
              icon={Archive}
              label="Archive thread"
              onClick={handleArchiveClick}
              tooltipSide="right"
              className="invisible col-start-1 row-start-1 size-auto p-0.5 text-muted-foreground/50 group-hover/thread:visible"
            />
          </div>
        </SidebarMenuSubButton>
      </SidebarMenuSubItem>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Archive thread?</AlertDialogTitle>
            <AlertDialogDescription>
              "{thread.title}" will be hidden from the sidebar. You can restore
              it anytime from Archived.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirming(false)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirming(false)
                archiveThread(workspaceId, thread.id)
              }}
            >
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
})

export function AppSidebar() {
  const { workspaces, deleteWorkspace, pinWorkspace, unpinWorkspace } = useWorkspace()
  const { handleCreateLocal, handleCreateRemote } = useCreateWorkspaceAction()
  const openPathMutation = useOpenPath()
  const openWithAppMutation = useOpenWorkspaceWithApp()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [expandedThreadLists, setExpandedThreadLists] = useState<
    Record<string, boolean>
  >({})
  const [archivedOpen, setArchivedOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false)
  const [deletingWorkspace, setDeletingWorkspace] = useState<
    (typeof workspaces)[0] | null
  >(null)
  const envWorkspaceId = useEnvDialog((s) => s.workspaceId)
  const openEnvDialog = useEnvDialog((s) => s.openEnvDialog)
  const closeEnvDialog = useEnvDialog((s) => s.closeEnvDialog)
  const envWorkspace =
    workspaces.find((ws) => ws.id === envWorkspaceId) ?? null
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const navigate = useNavigate()
  const openSettings = useCallback(() => {
    navigate({
      to: "/settings/$section",
      params: { section: DEFAULT_SETTINGS_SECTION },
    })
  }, [navigate])
  const openPalette = useCommandPalette((state) => state.openPalette)
  const { pendingThreadIds } = useMainTabs()


  async function handleConfirmDelete() {
    if (!deletingWorkspace) return
    setIsDeleting(true)
    setDeleteError(null)
    try {
      await deleteWorkspace(deletingWorkspace)
      setDeletingWorkspace(null)
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Failed to delete workspace"
      )
    } finally {
      setIsDeleting(false)
    }
  }

  const { threadId: activeThreadId } = useParams({ strict: false }) as {
    threadId?: string
  }

  const activeWorkspace =
    workspaces.find((ws) => ws.threads.some((t) => t.id === activeThreadId)) ??
    workspaces[0]

  useShortcutHandler(SHORTCUT_ACTIONS.NEW_WORKSPACE, () =>
    setCreateWorkspaceOpen(true)
  )
  useShortcutHandler(
    SHORTCUT_ACTIONS.NEW_THREAD,
    activeWorkspace
      ? () => {
          navigate({ to: "/new", search: { ws: activeWorkspace.id } })
        }
      : () => {
          navigate({ to: "/new", search: {} })
        }
  )
  useShortcutHandler(SHORTCUT_ACTIONS.OPEN_SETTINGS, openSettings)

  const newWorkspaceBinding = useShortcutBinding(SHORTCUT_ACTIONS.NEW_WORKSPACE)
  const newThreadBinding = useShortcutBinding(SHORTCUT_ACTIONS.NEW_THREAD)
  const openPaletteBinding = useShortcutBinding(SHORTCUT_ACTIONS.OPEN_COMMAND_PALETTE)
  const openSettingsBinding = useShortcutBinding(SHORTCUT_ACTIONS.OPEN_SETTINGS)

  // Collect all pinned threads across all workspaces, excluding pending ones
  const pinnedThreads = workspaces
    .flatMap((ws) =>
      ws.threads
        .filter((t) => t.isPinned && !pendingThreadIds.has(t.id))
        .map((t) => ({ ...t, workspaceId: ws.id, workspaceName: ws.name }))
    )
    .sort((a, b) => b.updatedAt - a.updatedAt)
  const pinnedWorkspaces = workspaces
    .filter((ws) => ws.isPinned)
    .sort((a, b) => a.createdAt - b.createdAt)
  const unpinnedWorkspaces = workspaces
    .filter((ws) => !ws.isPinned)
    .sort((a, b) => a.createdAt - b.createdAt)

  const renderWorkspaceItem = (ws: (typeof workspaces)[0]) => (
    <SidebarMenuItem key={ws.id} className="group/ws">
      <SidebarMenuButton
        onClick={() => {
          setCollapsed((prev) => ({
            ...prev,
            [ws.id]: !prev[ws.id],
          }))
        }}
        tooltip={ws.name}
      >
        <WorkspaceIcon workspaceId={ws.id} icon={ws.icon ?? null} isCollapsed={!!collapsed[ws.id]} />
        <span className="text-foreground/80">{ws.name}</span>
      </SidebarMenuButton>

      {/* Workspace options */}
      <DropdownMenu>
        <SidebarMenuAction
          showOnHover
          className="right-7"
          render={<DropdownMenuTrigger />}
        >
          <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground/60 transition-colors hover:text-foreground" />
          <span className="sr-only">Workspace options</span>
        </SidebarMenuAction>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => openPathMutation.mutate(ws.path)}
          >
            <FolderOpen className="mr-2 h-4 w-4" />
            Find in Finder
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() =>
              openWithAppMutation.mutate({
                workspacePath: ws.path,
              })
            }
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            Open in Editor
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openEnvDialog(ws.id)}>
            <KeyRound className="mr-2 h-4 w-4" />
            Environment Variables
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              if (ws.isPinned) {
                void unpinWorkspace(ws.id)
              } else {
                void pinWorkspace(ws.id)
              }
            }}
          >
            <Pin className="mr-2 h-4 w-4" />
            {ws.isPinned ? "Unpin Workspace" : "Pin Workspace"}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => {
              setDeleteError(null)
              setDeletingWorkspace(ws)
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete Workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* New thread action */}
      <Tooltip>
        <TooltipTrigger
          render={
            <SidebarMenuAction
              showOnHover
              onClick={() => {
                setCollapsed((prev) => ({
                  ...prev,
                  [ws.id]: false,
                }))
                navigate({
                  to: "/new",
                  search: { ws: ws.id },
                })
              }}
            >
              <MessageSquarePlus className="h-3.5 w-3.5 text-muted-foreground/60 transition-colors hover:text-foreground" />
              <span className="sr-only">New thread</span>
            </SidebarMenuAction>
          }
        />
        <TooltipContent side="right">
          New thread{" "}
          <ShortcutKbd
            binding={newThreadBinding}
            className="ml-1 opacity-55"
          />
        </TooltipContent>
      </Tooltip>

      {!collapsed[ws.id] && (
        ws.threads.filter((t) => !t.isPinned && !pendingThreadIds.has(t.id)).length > 0 ? (
          <SidebarMenuSub className="animate-in duration-150 fade-in-0 slide-in-from-top-1">
            {(() => {
              const visibleThreads = ws.threads.filter((t) => !t.isPinned && !pendingThreadIds.has(t.id))
              const visibleIds = new Set(visibleThreads.map((t) => t.id))
              const childrenMap = new Map<string, Thread[]>()
              const rootThreads: Thread[] = []
              for (const t of visibleThreads) {
                if (t.forkedFromId && visibleIds.has(t.forkedFromId)) {
                  const siblings = childrenMap.get(t.forkedFromId) ?? []
                  siblings.push(t)
                  childrenMap.set(t.forkedFromId, siblings)
                } else {
                  rootThreads.push(t)
                }
              }
              rootThreads.sort((a, b) => b.updatedAt - a.updatedAt)
              const renderThread = (thread: Thread, depth: number): React.ReactNode[] => {
                const children = (childrenMap.get(thread.id) ?? []).slice().sort((a, b) => b.updatedAt - a.updatedAt)
                return [
                  <ThreadRow
                    key={thread.id}
                    thread={thread}
                    workspaceId={ws.id}
                    isActive={activeThreadId === thread.id}
                    depth={depth}
                    onClick={() => {
                      navigate({
                        to: "/workspace/$threadId",
                        params: { threadId: thread.id },
                      })
                    }}
                  />,
                  ...children.flatMap((child) => renderThread(child, depth + 1)),
                ]
              }
              const flattened = rootThreads.flatMap((thread) =>
                renderThread(thread, 0)
              )
              const isExpanded = expandedThreadLists[ws.id] ?? false
              const visibleThreadRows = isExpanded
                ? flattened
                : flattened.slice(0, 5)

              return (
                <>
                  {visibleThreadRows}
                  {flattened.length > 5 && (
                    <SidebarMenuSubItem>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-[1.625rem] h-auto px-1 py-0.5 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() =>
                          setExpandedThreadLists((prev) => ({
                            ...prev,
                            [ws.id]: !isExpanded,
                          }))
                        }
                      >
                        {isExpanded ? "Show less" : "Show more"}
                      </Button>
                    </SidebarMenuSubItem>
                  )}
                </>
              )
            })()}
          </SidebarMenuSub>
        ) : (
          <div className="animate-in mx-2 my-1 rounded-md px-2 py-1.5 text-center duration-150 fade-in-0 slide-in-from-top-1">
            <span className="text-2xs text-muted-foreground/60">
              No threads
            </span>
          </div>
        )
      )}
    </SidebarMenuItem>
  )

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="h-11 shrink-0 p-0" />
      <SidebarContent className="overflow-hidden">
        {workspaces.length > 0 && (
          <div className="px-2 pb-1">
            <Button
              variant="ghost"
              size="sm"
              className="group/new-thread h-8 w-full gap-2 text-xs"
              onClick={() =>
                navigate({
                  to: "/new",
                  search: activeWorkspace ? { ws: activeWorkspace.id } : {},
                })
              }
            >
              <MessageSquarePlus className="size-3.5" />
              New Thread
              <ShortcutKbd
                binding={newThreadBinding}
                className="ml-auto opacity-0 transition-opacity group-hover/new-thread:opacity-55"
              />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="group/search h-8 w-full gap-2 text-xs"
              onClick={openPalette}
            >
              <Search className="size-3.5" />
              Search
              <ShortcutKbd
                binding={openPaletteBinding}
                className="ml-auto opacity-0 transition-opacity group-hover/search:opacity-55"
              />
            </Button>
          </div>
        )}

        {/* Pinned section: pinned workspaces + pinned threads */}
        {(pinnedWorkspaces.length > 0 || pinnedThreads.length > 0) && (
          <SidebarGroup>
            <SidebarGroupLabel>Pinned</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {pinnedWorkspaces.map(renderWorkspaceItem)}
                {pinnedThreads.map((thread) => (
                  <ThreadRow
                    key={thread.id}
                    thread={thread}
                    workspaceId={thread.workspaceId}
                    isActive={activeThreadId === thread.id}
                    onClick={() => {
                      navigate({
                        to: "/workspace/$threadId",
                        params: { threadId: thread.id },
                      })
                    }}
                  />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <SidebarGroup className="group/workspaces flex min-h-0 flex-1 flex-col">
          <SidebarGroupLabel className="text-3xs">WORKSPACES</SidebarGroupLabel>
          <Tooltip>
            <TooltipTrigger
              render={
                <SidebarGroupAction
                  className="invisible group-hover/workspaces:visible"
                  onClick={() => setCreateWorkspaceOpen(true)}
                >
                  <FolderPlus className="h-3.5 w-3.5 text-muted-foreground/60 transition-colors hover:text-foreground" />
                  <span className="sr-only">New workspace</span>
                </SidebarGroupAction>
              }
            />
            <TooltipContent side="right">
              New workspace{" "}
              <ShortcutKbd
                binding={newWorkspaceBinding}
                className="ml-1 opacity-55"
              />
            </TooltipContent>
          </Tooltip>
          <SidebarGroupContent className="min-h-0 overflow-y-auto">
            <SidebarMenu>
              {workspaces.length === 0 ? (
                <div className="my-3 flex flex-col items-center gap-2.5 px-2 text-center">
                  <div className="flex size-9 items-center justify-center rounded-xl border border-border/50 bg-muted/50">
                    <FolderOpen className="size-4 text-muted-foreground/60" />
                  </div>
                  <p className="text-xs text-muted-foreground/70">
                    No workspaces yet
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 text-xs"
                    onClick={() => setCreateWorkspaceOpen(true)}
                  >
                    <FolderPlus className="h-3 w-3" />
                    Add workspace
                  </Button>
                </div>
              ) : (
                unpinnedWorkspaces.map(renderWorkspaceItem)
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-border p-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={() => setArchivedOpen(true)}
        >
          <Archive />
          Archived
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={() => setFeedbackOpen(true)}
        >
          <MessagesSquare />
          Feedback
        </Button>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                onClick={openSettings}
              >
                <Settings className="transition-transform duration-300 group-hover/button:rotate-45" />
                Settings
              </Button>
            }
          />
          <TooltipContent side="right">
            Settings{" "}
            <ShortcutKbd
              binding={openSettingsBinding}
              className="ml-1 opacity-55"
            />
          </TooltipContent>
        </Tooltip>
      </SidebarFooter>
      <ArchivedThreadsDialog
        open={archivedOpen}
        onOpenChange={setArchivedOpen}
      />

      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />

      <CreateWorkspaceDialog
        open={createWorkspaceOpen}
        onOpenChange={setCreateWorkspaceOpen}
        onCreateLocal={handleCreateLocal}
        onCreateRemote={handleCreateRemote}
      />

      <AlertDialog
        open={!!deletingWorkspace}
        onOpenChange={(open) => {
          if (!open && !isDeleting) setDeletingWorkspace(null)
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete workspace?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deletingWorkspace?.name}" and all its threads will be
              permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <p className="px-1 text-xs text-destructive">{deleteError}</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setDeletingWorkspace(null)}
              disabled={isDeleting}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {envWorkspace && (
        <WorkspaceEnvDialog
          workspace={envWorkspace}
          open={!!envWorkspace}
          onOpenChange={(open) => { if (!open) closeEnvDialog() }}
        />
      )}
    </Sidebar>
  )
}
