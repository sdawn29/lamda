import { useQuery } from "@tanstack/react-query"
import { gitStatus } from "@/api/git"

export const gitStatusKey = (sessionId: string) => ["git-status", sessionId] as const

export function useGitStatus(sessionId: string) {
  return useQuery({
    queryKey: gitStatusKey(sessionId),
    queryFn: () => gitStatus(sessionId),
    enabled: !!sessionId,
    staleTime: 0,
  })
}
