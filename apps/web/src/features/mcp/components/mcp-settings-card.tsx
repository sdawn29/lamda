import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { Server, Plus, Info } from "lucide-react"
import { Card, CardContent } from "@/shared/ui/card"
import { Button } from "@/shared/ui/button"
import { Alert, AlertDescription } from "@/shared/ui/alert"
import { Separator } from "@/shared/ui/separator"
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

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-6">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardContent className="flex flex-col gap-4 p-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">MCP Servers</p>
                <p className="text-xs text-muted-foreground">Connect to Model Context Protocol servers</p>
              </div>
            </div>
            <Button size="sm" onClick={() => openForm("new")}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add Server
            </Button>
          </div>

          <Separator />

          {/* Server list */}
          {servers.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <Server className="h-8 w-8 text-muted-foreground/40" />
              <div>
                <p className="text-sm text-muted-foreground">No MCP servers configured</p>
                <p className="text-xs text-muted-foreground">Add a server to enable additional tools for the agent</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
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

          <Alert>
            <Info />
            <AlertDescription>
              MCP servers are configured once and shared across all workspaces. Click the play/stop button to start or stop servers. Tools from connected servers are automatically available to the agent.
            </AlertDescription>
          </Alert>
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
