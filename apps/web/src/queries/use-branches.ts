import { useQuery } from "@tanstack/react-query"
import { listBranches } from "@/api/sessions"

export const branchesKey = (sessionId: string) => ["branches", sessionId] as const

export function useBranches(sessionId: string) {
  return useQuery({
    queryKey: branchesKey(sessionId),
    queryFn: () => listBranches(sessionId),
    enabled: !!sessionId,
    staleTime: 30_000,
  })
}
