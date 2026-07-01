import { useCallback, useState } from "react"
import { useBranch, useBranches, useSessionWorktrees } from "./queries"
import { useCheckoutBranch } from "./mutations"
import { parseApiError } from "./parse-error"
import {
  useEnterThreadWorktree,
  useSwitchThreadToLocal,
} from "@/features/workspace/mutations"

interface ThreadBranchControlsArgs {
  threadId?: string
  sessionId?: string
  worktreeBranch?: string | null
}

/** Drives the branch selector + worktree ("working location") controls for
 *  the active thread — branch/worktree data plus the checkout/enter-worktree
 *  flow that a branch pick can trigger. */
export function useThreadBranchControls({
  threadId,
  sessionId,
  worktreeBranch,
}: ThreadBranchControlsArgs) {
  const { data: branchData } = useBranch(sessionId ?? "")
  const { data: branchesData } = useBranches(sessionId ?? "")
  const { data: sessionWorktrees } = useSessionWorktrees(sessionId ?? "")
  const branch = branchData?.branch ?? null
  const branches = branchesData?.branches ?? []

  const [gitError, setGitError] = useState<string | null>(null)
  const clearGitError = useCallback(() => setGitError(null), [])
  const handleGitError = useCallback((message: string) => {
    setGitError(message)
  }, [])

  const checkoutBranchMutation = useCheckoutBranch(sessionId ?? "")
  const enterWorktreeMutation = useEnterThreadWorktree()
  const switchToLocalMutation = useSwitchThreadToLocal()

  const handleBranchSelect = useCallback(
    async (selectedBranch: string) => {
      if (!threadId || !sessionId) return
      const onError = (err: unknown) => handleGitError(parseApiError(err))

      // A branch checked out in a secondary worktree can't be checked out in
      // place — open the thread in that worktree's directory instead.
      const worktree = sessionWorktrees?.find(
        (w) => w.branch === selectedBranch
      )
      if (worktree) {
        if (worktreeBranch === selectedBranch) return
        try {
          if (worktreeBranch) {
            await switchToLocalMutation.mutateAsync({ threadId, sessionId })
          }
          await enterWorktreeMutation.mutateAsync({
            threadId,
            sessionId,
            branch: selectedBranch,
          })
        } catch (error) {
          onError(error)
        }
        return
      }

      try {
        if (worktreeBranch) {
          await switchToLocalMutation.mutateAsync({ threadId, sessionId })
        }
        await checkoutBranchMutation.mutateAsync(selectedBranch)
      } catch (error) {
        onError(error)
      }
    },
    [
      checkoutBranchMutation,
      enterWorktreeMutation,
      switchToLocalMutation,
      sessionWorktrees,
      threadId,
      sessionId,
      worktreeBranch,
      handleGitError,
    ]
  )

  return {
    branch,
    branches,
    gitError,
    clearGitError,
    handleGitError,
    handleBranchSelect,
  }
}
