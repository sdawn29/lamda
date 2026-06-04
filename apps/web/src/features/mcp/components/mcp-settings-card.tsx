import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { Plus } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Card, CardContent } from "@/shared/ui/card"
import { Skeleton } from "@/shared/ui/skeleton"
import { useMcpSettings, useMcpServerStatus, useMcpTools } from "../queries"
import { useSaveMcpSettings } from "../mutations"
import type { McpServerConfig } from "../types"
import { ServerListItem, DeleteConfirmDialog } from "./server-form"

export function McpSettingsCard() {
  const navigate = useNavigate()
  const { data: settings, isLoading } = useMcpSettings()
  const { data: serverStatus } = useMcpServerStatus()
  const { data: allTools } = useMcpTools()
  const saveSettings = useSaveMcpSettings()
  const servers = settings?.servers ?? []

  const [serverToDelete, setServerToDelete] = useState<string | null>(null)

  function openForm(serverName: string) {
    navigate({
      to: "/settings/$section",
      params: { section: "mcp" },
      search: { server: serverName },
    })
  }

  function confirmDelete() {
    if (serverToDelete) {
      saveSettings.mutate({
        settings: { servers: servers.filter((s) => s.name !== serverToDelete) },
      })
    }
    setServerToDelete(null)
  }

  function getStatus(name: string) {
    return serverStatus?.find((s) => s.name === name)
  }

  function getServerTools(name: string) {
    return allTools?.filter((t) => t.serverName === name)
  }

  return (
    <>
      <Card>
        <CardContent className="flex flex-col gap-3 px-4 py-4">
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {isLoading
                ? "Loading…"
                : servers.length === 0
                  ? "No servers configured"
                  : `${servers.length} server${servers.length === 1 ? "" : "s"}`}
            </p>
            <Button size="sm" variant="outline" onClick={() => openForm("new")}>
              <Plus data-icon="inline-start" />
              Add server
            </Button>
          </div>

          {/* Server list */}
          {isLoading ? (
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : servers.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/50 px-4 py-10 text-center">
              <p className="text-sm text-muted-foreground">No MCP servers yet</p>
              <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground/70">
                Add a server to extend the agent with additional tools.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {servers.map((server: McpServerConfig) => (
                <ServerListItem
                  key={server.name}
                  server={server}
                  status={getStatus(server.name)}
                  tools={getServerTools(server.name)}
                  onEdit={() => openForm(server.name)}
                  onDelete={() => setServerToDelete(server.name)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <DeleteConfirmDialog
        open={!!serverToDelete}
        serverName={serverToDelete}
        onConfirm={confirmDelete}
        onCancel={() => setServerToDelete(null)}
      />
    </>
  )
}
