import React, { useState, useCallback, useEffect, useRef, memo } from "react"
import {
  Archive,
  ExternalLink,
  FolderPlus,
  FolderOpen,
  KeyRound,
  Loader2,
  MessageSquarePlus,
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
import { useWorkspace, useCreateWorkspaceAction } from "../context"
import { useThreadStatus } from "@/features/chat"
import type { Thread } from "../context"
import { DEFAULT_SETTINGS_SECTION } from "@/features/settings"
import { useMainTabs } from "@/features/main-tabs"
import { useCommandPalette } from "@/features/command-palette"
import { ArchivedThreadsDialog } from "./archived-threads-dialog"
import { CreateWorkspaceDialog } from "./create-workspace-dialog"
import { WorkspaceEnvDialog } from "./workspace-env-dialog"
import type { WorkspaceDto } from "../api"
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
  const diff = Math.floor((now - ts) / 1000)
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
              {status === "streaming" ? (
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
              {relativeTime(thread.createdAt, now)}
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
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false)
  const [deletingWorkspace, setDeletingWorkspace] = useState<
    (typeof workspaces)[0] | null
  >(null)
  const [envWorkspace, setEnvWorkspace] = useState<WorkspaceDto | null>(null)
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
  const pinnedThreads = workspaces.flatMap((ws) =>
    ws.threads
      .filter((t) => t.isPinned && !pendingThreadIds.has(t.id))
      .map((t) => ({ ...t, workspaceId: ws.id, workspaceName: ws.name }))
  )

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="h-11 shrink-0 p-0" />
      <SidebarContent className="overflow-hidden">
        {/* Pinned threads section */}
        {pinnedThreads.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Pinned</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
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

        {workspaces.length > 0 && (
          <div className="px-2 pb-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-full gap-2 text-xs"
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
                className="ml-auto opacity-55"
              />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-full gap-2 text-xs"
              onClick={openPalette}
            >
              <Search className="size-3.5" />
              Search
              <ShortcutKbd
                binding={openPaletteBinding}
                className="ml-auto opacity-55"
              />
            </Button>
          </div>
        )}

        <SidebarGroup className="group/workspaces flex min-h-0 flex-1 flex-col">
          <SidebarGroupLabel className="text-[10px]">WORKSPACES</SidebarGroupLabel>
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
                [...workspaces]
                  .sort((a, b) => {
                    if (a.isPinned && !b.isPinned) return -1
                    if (!a.isPinned && b.isPinned) return 1
                    return a.createdAt - b.createdAt
                  })
                  .map((ws) => (
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
                      <span className="text-foreground/80">{ws.name}</span>
                    </SidebarMenuButton>

                    {/* New thread action */}
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <SidebarMenuAction
                            showOnHover
                            className="right-7"
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

                    {/* Workspace options */}
                    <DropdownMenu>
                      <SidebarMenuAction
                        showOnHover
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
                        <DropdownMenuItem onClick={() => setEnvWorkspace(ws)}>
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
                            rootThreads.sort((a, b) => b.createdAt - a.createdAt)
                            const renderThread = (thread: Thread, depth: number): React.ReactNode[] => {
                              const children = (childrenMap.get(thread.id) ?? []).slice().sort((a, b) => b.createdAt - a.createdAt)
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
                          <span className="text-[11px] text-muted-foreground/60">
                            No threads
                          </span>
                        </div>
                      )
                    )}
                  </SidebarMenuItem>
                ))
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
          onOpenChange={(open) => { if (!open) setEnvWorkspace(null) }}
        />
      )}
    </Sidebar>
  )
}
