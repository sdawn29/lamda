import { useQuery } from "@tanstack/react-query"
import { fetchLspRegistry } from "./api"

export const lspKeys = {
  all: ["lsp"] as const,
  registry: ["lsp", "registry"] as const,
}

export function useLspRegistry() {
  return useQuery({
    queryKey: lspKeys.registry,
    queryFn: ({ signal }) => fetchLspRegistry(signal),
    staleTime: 30 * 1000,
  })
}
