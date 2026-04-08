import { useQuery } from "@tanstack/react-query"
import { fetchProviders } from "@/api/providers"

export const providersQueryKey = ["providers"] as const

export function useProviders() {
  return useQuery({
    queryKey: providersQueryKey,
    queryFn: ({ signal }) => fetchProviders(signal),
    staleTime: 30 * 1000,
  })
}
