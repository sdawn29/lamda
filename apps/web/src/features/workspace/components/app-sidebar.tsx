import { useState, useCallback, useEffect } from "react"
import {
  Archive,
  ChevronRight,
  ExternalLink,
  Folder,
  FolderOpen,
  Loader2,
  MoreHorizontal,
  Pin,
  Plus,
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
import { useCommandPalette } from "@/features/command-palette"
import { useThreadStatus } from "@/features/chat"
import type { Thread } from "../context"
import { useSettingsModal } from "@/features/settings"
import { ArchivedThreadsDialog } from "./archived-threads-dialog"
import { CreateWorkspaceDialog } from "./create-workspace-dialog"
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
import { cn } from "@/shared/lib/utils"

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

function ThreadRow({
  thread,
  workspaceId,
  isActive,
  onClick,
}: {
  thread: Thread
  workspaceId: string
  isActive: boolean
  onClick: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const status = useThreadStatus(thread.id)
  const now = useNow()
  const { archiveThread, pinThread, unpinThread } = useWorkspace()

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

  return (
    <>
      <SidebarMenuSubItem className="group/thread">
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
          <span className="truncate">{thread.title}</span>
          <div className="ml-auto grid shrink-0 items-center">
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
}

export function AppSidebar() {
  const { workspaces, createThread, deleteWorkspace } = useWorkspace()
  const { handleCreateLocal, handleCreateRemote } = useCreateWorkspaceAction()
  const openPathMutation = useOpenPath()
  const openWithAppMutation = useOpenWorkspaceWithApp()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [archivedOpen, setArchivedOpen] = useState(false)
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false)
  const [deletingWorkspace, setDeletingWorkspace] = useState<
    (typeof workspaces)[0] | null
  >(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const navigate = useNavigate()
  const { openSettings } = useSettingsModal()
  const { openPalette } = useCommandPalette()
  const openCommandPaletteBinding = useShortcutBinding(
    SHORTCUT_ACTIONS.OPEN_COMMAND_PALETTE
  )

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
      ? async () => {
          const thread = await createThread(activeWorkspace.id)
          navigate({
            to: "/workspace/$threadId",
            params: { threadId: thread.id },
          })
        }
      : null
  )
  useShortcutHandler(SHORTCUT_ACTIONS.OPEN_SETTINGS, openSettings)

  const newWorkspaceBinding = useShortcutBinding(SHORTCUT_ACTIONS.NEW_WORKSPACE)
  const newThreadBinding = useShortcutBinding(SHORTCUT_ACTIONS.NEW_THREAD)
  const openSettingsBinding = useShortcutBinding(SHORTCUT_ACTIONS.OPEN_SETTINGS)

  // Collect all pinned threads across all workspaces
  const pinnedThreads = workspaces.flatMap((ws) =>
    ws.threads
      .filter((t) => t.isPinned)
      .map((t) => ({ ...t, workspaceId: ws.id, workspaceName: ws.name }))
  )

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="mt-10 px-4 pb-0">
        <button
          onClick={openPalette}
          className="flex h-8 w-full items-center gap-2 rounded-md border border-input bg-muted/20 px-2 text-xs text-muted-foreground transition-colors hover:bg-muted/40 dark:bg-muted/30 dark:hover:bg-muted/50"
        >
          <Search className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1 truncate text-left">Search</span>
          <ShortcutKbd binding={openCommandPaletteBinding} />
        </button>
      </SidebarHeader>
      <SidebarContent>
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
                    onClick={() =>
                      navigate({
                        to: "/workspace/$threadId",
                        params: { threadId: thread.id },
                      })
                    }
                  />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <SidebarGroup>
          <SidebarGroupLabel>Workspaces</SidebarGroupLabel>
          <Tooltip>
            <TooltipTrigger
              render={
                <SidebarGroupAction
                  onClick={() => setCreateWorkspaceOpen(true)}
                >
                  <Plus />
                  <span className="sr-only">New workspace</span>
                </SidebarGroupAction>
              }
            />
            <TooltipContent side="right">
              New workspace{" "}
              <ShortcutKbd binding={newWorkspaceBinding} className="ml-1" />
            </TooltipContent>
          </Tooltip>
          <SidebarGroupContent>
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
                    <Plus className="h-3 w-3" />
                    Add workspace
                  </Button>
                </div>
              ) : (
                workspaces.map((ws) => (
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
                      <span className="relative h-4 w-4 shrink-0">
                        <Folder className="absolute inset-0 h-4 w-4 transition-[opacity,transform] duration-150 group-hover/ws:scale-75 group-hover/ws:opacity-0" />
                        <ChevronRight
                          className={`absolute inset-0 h-4 w-4 opacity-0 transition-[opacity,transform] duration-150 group-hover/ws:opacity-100 ${collapsed[ws.id] ? "" : "rotate-90"}`}
                        />
                      </span>
                      <span>{ws.name}</span>
                    </SidebarMenuButton>

                    {/* New thread action */}
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <SidebarMenuAction
                            showOnHover
                            className="right-7"
                            onClick={async () => {
                              const thread = await createThread(ws.id)
                              navigate({
                                to: "/workspace/$threadId",
                                params: { threadId: thread.id },
                              })
                            }}
                          >
                            <Plus />
                            <span className="sr-only">New thread</span>
                          </SidebarMenuAction>
                        }
                      />
                      <TooltipContent side="right">
                        New thread{" "}
                        <ShortcutKbd
                          binding={newThreadBinding}
                          className="ml-1"
                        />
                      </TooltipContent>
                    </Tooltip>

                    {/* Workspace options */}
                    <DropdownMenu>
                      <SidebarMenuAction
                        showOnHover
                        render={<DropdownMenuTrigger />}
                      >
                        <MoreHorizontal />
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

                    {!collapsed[ws.id] &&
                      ws.threads.filter((t) => !t.isPinned).length > 0 && (
                        <SidebarMenuSub className="animate-in duration-150 fade-in-0 slide-in-from-top-1">
                          {ws.threads
                            .filter((t) => !t.isPinned)
                            .map((thread) => (
                              <ThreadRow
                                key={thread.id}
                                thread={thread}
                                workspaceId={ws.id}
                                isActive={activeThreadId === thread.id}
                                onClick={() =>
                                  navigate({
                                    to: "/workspace/$threadId",
                                    params: { threadId: thread.id },
                                  })
                                }
                              />
                            ))}
                        </SidebarMenuSub>
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
            <ShortcutKbd binding={openSettingsBinding} className="ml-1" />
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
    </Sidebar>
  )
}
