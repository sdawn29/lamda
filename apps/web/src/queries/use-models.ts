import { useQuery } from "@tanstack/react-query"
import { fetchModels } from "@/api/models"

export const modelsQueryKey = ["models"] as const

export function useModels() {
  return useQuery({
    queryKey: modelsQueryKey,
    queryFn: ({ signal }) => fetchModels(signal),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
  })
}
