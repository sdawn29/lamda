import { Edit, FolderOpen, Plus } from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { useWorkspace } from "@/hooks/workspace-context"

const items = [{ title: "New Thread", url: "/", icon: Edit }]

export function AppSidebar() {
  const { workspaces, activeWorkspace, selectWorkspace, createWorkspace } =
    useWorkspace()

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
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    render={<a href={item.url} />}
                    tooltip={item.title}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <div className="flex items-center justify-between">
            <SidebarGroupLabel>
              <span className="font-serif">Workspaces</span>
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
                    <SidebarMenuButton
                      isActive={activeWorkspace?.id === ws.id}
                      onClick={() => selectWorkspace(ws)}
                      tooltip={ws.name}
                    >
                      <FolderOpen />
                      <span>{ws.name}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
