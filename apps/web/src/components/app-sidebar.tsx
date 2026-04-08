import { useState } from "react"
import { ChevronRight, FolderOpen, MoreHorizontal, Plus, Settings, Trash2 } from "lucide-react"
import { useNavigate, useLocation, useParams } from "@tanstack/react-router"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useWorkspace, useCreateWorkspaceAction } from "@/hooks/workspace-context"

export function AppSidebar() {
  const { workspaces, createThread, deleteWorkspace } = useWorkspace()
  const handleCreateWorkspace = useCreateWorkspaceAction()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const navigate = useNavigate()
  const location = useLocation()
  const isSettings = location.pathname === "/settings"

  // Get the active thread from URL params (undefined on non-thread routes)
  const { threadId: activeThreadId } = useParams({ strict: false }) as { threadId?: string }

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarContent className="mt-10">
        <SidebarGroup>
          <div className="flex items-center justify-between">
            <SidebarGroupLabel>Workspaces</SidebarGroupLabel>
            <Button variant="ghost" size="icon-sm" onClick={handleCreateWorkspace}>
              <Plus />
            </Button>
          </div>
          <SidebarGroupContent>
            <SidebarMenu>
              {workspaces.length === 0 ? (
                <div className="my-2 text-center text-muted-foreground">
                  No workspaces available
                </div>
              ) : (
                workspaces.map((ws) => (
                  <SidebarMenuItem key={ws.id}>
                    <div className="group/ws flex items-center">
                      <SidebarMenuButton
                        onClick={() => {
                          setCollapsed((prev) => ({
                            ...prev,
                            [ws.id]: !prev[ws.id],
                          }))
                        }}
                        tooltip={ws.name}
                        className="flex-1"
                      >
                        <span className="relative h-4 w-4 shrink-0">
                          <FolderOpen className="absolute inset-0 h-4 w-4 transition-[opacity,transform] duration-150 group-hover/ws:opacity-0 group-hover/ws:scale-75" />
                          <ChevronRight
                            className={`absolute inset-0 h-4 w-4 opacity-0 transition-[opacity,transform] duration-150 group-hover/ws:opacity-100 ${collapsed[ws.id] ? "" : "rotate-90"}`}
                          />
                        </span>
                        <span>{ws.name}</span>
                      </SidebarMenuButton>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="shrink-0 opacity-0 transition-opacity group-hover/ws:opacity-100"
                        onClick={async () => {
                          const thread = await createThread(ws.id)
                          navigate({
                            to: "/workspace/$threadId",
                            params: { threadId: thread.id },
                          })
                        }}
                        title="New Thread"
                      >
                        <Plus />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md opacity-0 transition-opacity hover:bg-accent group-hover/ws:opacity-100"
                          title="More options"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              // open in Finder (macOS) / File Explorer (Windows)
                              window.electronAPI?.openPath?.(ws.path)
                            }}
                          >
                            <FolderOpen className="mr-2 h-4 w-4" />
                            Find in Finder
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => deleteWorkspace(ws)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete Workspace
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {!collapsed[ws.id] && ws.threads.length > 0 && (
                      <SidebarMenuSub className="animate-in fade-in-0 slide-in-from-top-1 duration-150">
                        {ws.threads.map((thread) => (
                          <SidebarMenuSubItem key={thread.id}>
                            <SidebarMenuSubButton
                              isActive={activeThreadId === thread.id}
                              onClick={() =>
                                navigate({
                                  to: "/workspace/$threadId",
                                  params: { threadId: thread.id },
                                })
                              }
                            >
                              <span className="truncate">{thread.title}</span>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
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
        <button
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
            isSettings
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
          onClick={() => navigate({ to: "/settings" })}
        >
          <Settings className="h-3.5 w-3.5 shrink-0 transition-transform duration-300 hover:rotate-45" />
          Settings
        </button>
      </SidebarFooter>
    </Sidebar>
  )
}
