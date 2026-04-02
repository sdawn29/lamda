import { Edit, Plus } from "lucide-react"

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
import { Button } from "./ui/button"

const items = [{ title: "New Thread", url: "/", icon: Edit }]

export function AppSidebar() {
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
            <SidebarGroupLabel>Workspaces</SidebarGroupLabel>
            <Button variant="ghost" size="icon">
              <Plus />
            </Button>
          </div>
          <SidebarGroupContent>
            <SidebarMenuItem>
              <div className="my-2 text-center text-muted-foreground">
                No workspaces available
              </div>
            </SidebarMenuItem>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
