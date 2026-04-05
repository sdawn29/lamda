import { useState } from "react"
import { ChevronRight, FolderOpen, Plus, Settings } from "lucide-react"
import { useNavigate, useLocation } from "@tanstack/react-router"

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
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useWorkspace } from "@/hooks/workspace-context"

export function AppSidebar() {
  const {
    workspaces,
    activeThread,
    selectWorkspace,
    createWorkspace,
    createThread,
    selectThread,
  } = useWorkspace()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const navigate = useNavigate()
  const location = useLocation()
  const isSettings = location.pathname === "/settings"

  async function handleCreateWorkspace() {
    const folderPath = await window.electronAPI?.selectFolder()
    if (folderPath) {
      const folderName = folderPath.split(/[/\\]/).pop() || folderPath
      createWorkspace(folderName, folderPath)
    }
  }

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
                          selectWorkspace(ws)
                          setCollapsed((prev) => ({
                            ...prev,
                            [ws.id]: !prev[ws.id],
                          }))
                        }}
                        tooltip={ws.name}
                        className="flex-1"
                      >
                        <ChevronRight
                          className={`h-3 w-3 shrink-0 transition-transform ${collapsed[ws.id] ? "" : "rotate-90"}`}
                        />
                        <FolderOpen className="h-4 w-4 shrink-0" />
                        <span>{ws.name}</span>
                      </SidebarMenuButton>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="shrink-0 opacity-0 transition-opacity group-hover/ws:opacity-100"
                        onClick={() => createThread(ws.id)}
                        title="New Thread"
                      >
                        <Plus />
                      </Button>
                    </div>

                    {!collapsed[ws.id] && ws.threads.length > 0 && (
                      <SidebarMenuSub>
                        {ws.threads.map((thread) => (
                          <SidebarMenuSubItem key={thread.id}>
                            <SidebarMenuSubButton
                              isActive={activeThread?.id === thread.id}
                              onClick={() => selectThread(ws.id, thread)}
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
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
          onClick={() => navigate({ to: "/settings" })}
        >
          <Settings className="h-3.5 w-3.5 shrink-0" />
          Settings
        </button>
      </SidebarFooter>
    </Sidebar>
  )
}
