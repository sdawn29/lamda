import { useMutation, useQueryClient } from "@tanstack/react-query"
import { gitCommit } from "@/api/git"
import { gitStatusKey } from "@/queries/use-git-status"

export function useGitCommit(sessionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (message: string) => gitCommit(sessionId, message),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gitStatusKey(sessionId) })
    },
  })
}
