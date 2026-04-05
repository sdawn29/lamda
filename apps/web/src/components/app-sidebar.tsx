import { useState } from "react"
import { ChevronRight, FolderOpen, Plus } from "lucide-react"

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
            <SidebarGroupLabel>
              <span>Workspaces</span>
            </SidebarGroupLabel>
            <Button variant="ghost" size="icon" onClick={handleCreateWorkspace}>
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
                        <span className="relative h-4 w-4 shrink-0">
                          <FolderOpen className="absolute inset-0 h-4 w-4 transition-opacity group-hover/ws:opacity-0" />
                          <ChevronRight
                            className={`absolute inset-0 h-4 w-4 opacity-0 transition-all group-hover/ws:opacity-100 ${collapsed[ws.id] ? "" : "rotate-90"}`}
                          />
                        </span>
                        <span>{ws.name}</span>
                      </SidebarMenuButton>
                      <Button
                        variant="ghost"
                        size="icon"
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
        <SidebarFooter />
      </SidebarContent>
    </Sidebar>
  )
}
