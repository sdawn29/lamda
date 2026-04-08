import { useQuery } from "@tanstack/react-query"
import { getBranch } from "@/api/sessions"

export const branchKey = (sessionId: string) => ["branch", sessionId] as const

export function useBranch(sessionId: string) {
  return useQuery({
    queryKey: branchKey(sessionId),
    queryFn: () => getBranch(sessionId),
    enabled: !!sessionId,
    staleTime: 30_000,
  })
}
