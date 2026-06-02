import { useMutation, useQueryClient } from "@tanstack/react-query"
import { saveMcpSettings, testMcpConnection, startMcpServer, stopMcpServer, setMcpServerEnabled } from "./api"
import type { McpServerConfig } from "./types"
import { mcpKeys } from "./queries"

export function useSaveMcpSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      settings,
    }: {
      settings: { servers: McpServerConfig[] }
    }) => saveMcpSettings(settings),
    onMutate: async ({ settings }) => {
      // Optimistically update the cache
      const prev = queryClient.getQueryData(mcpKeys.settings())
      queryClient.setQueryData(mcpKeys.settings(), settings)
      return { prev }
    },
    onError: (_err, _vars, context) => {
      // Rollback on error
      if (context?.prev) {
        queryClient.setQueryData(mcpKeys.settings(), context.prev)
      }
    },
    onSettled: () => {
      // Always refetch after mutation
      queryClient.invalidateQueries({ queryKey: mcpKeys.settings() })
      queryClient.invalidateQueries({ queryKey: mcpKeys.status() })
      queryClient.invalidateQueries({ queryKey: mcpKeys.tools() })
    },
  })
}

export function useTestMcpConnection() {
  return useMutation({
    mutationFn: (server: McpServerConfig) => testMcpConnection(server),
  })
}

export function useStartMcpServer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ serverName }: { serverName: string }) =>
      startMcpServer(serverName),
    onSettled: () => {
      // Refresh status and tools after starting
      queryClient.invalidateQueries({ queryKey: mcpKeys.status() })
      queryClient.invalidateQueries({ queryKey: mcpKeys.tools() })
    },
  })
}

export function useStopMcpServer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ serverName }: { serverName: string }) =>
      stopMcpServer(serverName),
    onSettled: () => {
      // Refresh status and tools after stopping
      queryClient.invalidateQueries({ queryKey: mcpKeys.status() })
      queryClient.invalidateQueries({ queryKey: mcpKeys.tools() })
    },
  })
}

export function useSetMcpServerEnabled() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ serverName, enabled }: { serverName: string; enabled: boolean }) =>
      setMcpServerEnabled(serverName, enabled),
    onSettled: () => {
      // Refresh settings and status after toggling enabled
      queryClient.invalidateQueries({ queryKey: mcpKeys.settings() })
      queryClient.invalidateQueries({ queryKey: mcpKeys.status() })
      queryClient.invalidateQueries({ queryKey: mcpKeys.tools() })
    },
  })
}
