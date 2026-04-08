import { useMutation, useQueryClient } from "@tanstack/react-query"
import { gitStash, gitStashPop, gitStashApply, gitStashDrop } from "@/api/git"
import { gitStatusKey } from "@/queries/use-git-status"
import { gitStashListKey } from "@/queries/use-git-stash-list"

export function useGitStashMutations(sessionId: string) {
  const queryClient = useQueryClient()

  const invalidateStatus = () =>
    queryClient.invalidateQueries({ queryKey: gitStatusKey(sessionId) })
  const invalidateList = () =>
    queryClient.invalidateQueries({ queryKey: gitStashListKey(sessionId) })
  const invalidateBoth = () => {
    invalidateStatus()
    invalidateList()
  }

  return {
    stash: useMutation({
      mutationFn: (message?: string) => gitStash(sessionId, message),
      onSuccess: invalidateBoth,
    }),
    pop: useMutation({
      mutationFn: (ref: string) => gitStashPop(sessionId, ref),
      onSuccess: invalidateBoth,
    }),
    apply: useMutation({
      mutationFn: (ref: string) => gitStashApply(sessionId, ref),
      onSuccess: invalidateStatus,
    }),
    drop: useMutation({
      mutationFn: (ref: string) => gitStashDrop(sessionId, ref),
      onSuccess: invalidateList,
    }),
  }
}
