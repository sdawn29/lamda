import { useMutation, useQueryClient } from "@tanstack/react-query"
import { gitStageAll, gitUnstageAll } from "@/api/git"
import { gitStatusKey } from "@/queries/use-git-status"

export function useGitStageAll(sessionId: string) {
  const queryClient = useQueryClient()
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: gitStatusKey(sessionId) })
  return {
    stageAll: useMutation({
      mutationFn: () => gitStageAll(sessionId),
      onSuccess: invalidate,
    }),
    unstageAll: useMutation({
      mutationFn: () => gitUnstageAll(sessionId),
      onSuccess: invalidate,
    }),
  }
}
