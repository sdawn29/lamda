import { useSearch } from "@tanstack/react-router"
import { McpSettingsCard, ServerFormPage } from "@/features/mcp"

export function McpSection() {
  const { server } = useSearch({ from: "/settings/$section" })
  if (server) {
    return <ServerFormPage serverName={server} />
  }
  return <McpSettingsCard />
}
