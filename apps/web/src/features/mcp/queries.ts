import { useQuery } from "@tanstack/react-query"
import { fetchMcpSettings, fetchMcpServerStatus, fetchMcpTools } from "./api"

const mcpRootKey = ["mcp"] as const

export const mcpKeys = {
  all: mcpRootKey,
  settings: () => [...mcpRootKey, "settings"] as const,
  status: () => [...mcpRootKey, "status"] as const,
  tools: () => [...mcpRootKey, "tools"] as const,
}

/**
 * Fetch MCP settings (application-wide)
 */
export function useMcpSettings() {
  return useQuery({
    queryKey: mcpKeys.settings(),
    queryFn: ({ signal }) => fetchMcpSettings(signal),
    staleTime: 30 * 1000,
  })
}

/**
 * Fetch MCP server status (application-wide)
 */
export function useMcpServerStatus() {
  return useQuery({
    queryKey: mcpKeys.status(),
    queryFn: ({ signal }) => fetchMcpServerStatus(signal),
    staleTime: 10 * 1000,
    refetchInterval: 30 * 1000, // Refresh status periodically
  })
}

/**
 * Fetch available MCP tools (application-wide)
 */
export function useMcpTools() {
  return useQuery({
    queryKey: mcpKeys.tools(),
    queryFn: ({ signal }) => fetchMcpTools(signal),
    staleTime: 30 * 1000,
  })
}
