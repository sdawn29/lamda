import { useMutation, useQueryClient } from "@tanstack/react-query"
import { gitStage, gitUnstage } from "@/api/git"
import { gitStatusKey } from "@/queries/use-git-status"

export function useGitStage(sessionId: string) {
  const queryClient = useQueryClient()
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: gitStatusKey(sessionId) })
  return {
    stage: useMutation({
      mutationFn: (filePath: string) => gitStage(sessionId, filePath),
      onSuccess: invalidate,
    }),
    unstage: useMutation({
      mutationFn: (filePath: string) => gitUnstage(sessionId, filePath),
      onSuccess: invalidate,
    }),
  }
}
