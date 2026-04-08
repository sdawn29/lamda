import { useQuery } from "@tanstack/react-query"
import { gitStashList } from "@/api/git"

export const gitStashListKey = (sessionId: string) =>
  ["git-stash-list", sessionId] as const

export function useGitStashList(sessionId: string) {
  return useQuery({
    queryKey: gitStashListKey(sessionId),
    queryFn: () => gitStashList(sessionId),
    enabled: !!sessionId,
    staleTime: 0,
  })
}
