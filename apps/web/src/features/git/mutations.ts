import {
  type QueryClient,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"
import {
  gitCommit,
  gitStage,
  gitUnstage,
  gitStageAll,
  gitUnstageAll,
  gitStash,
  gitStashPop,
  gitStashApply,
  gitStashDrop,
  gitRevertFile,
  gitPush,
  gitFetch,
  gitPull,
  gitGenerateCommitMessage,
} from "./api"
import {
  gitKeys,
  gitStatusKey,
  gitStashListKey,
  branchKey,
  branchesKey,
  gitDiffStatKey,
} from "./queries"
import {
  checkoutBranch,
  createBranch,
  initializeGitRepository,
} from "@/features/chat/api"
async function invalidateGitSession(
  queryClient: QueryClient,
  sessionId: string
) {
  await queryClient.invalidateQueries({ queryKey: gitKeys.session(sessionId) })
}

async function invalidateWorkspaceFiles(queryClient: QueryClient) {
  await queryClient.invalidateQueries({ queryKey: ["workspace-files"] })
}

// ── Commit ────────────────────────────────────────────────────────────────────

export function useGitCommit(sessionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (message: string) => gitCommit(sessionId, message),
    onSuccess: async () => {
      await invalidateGitSession(queryClient, sessionId)
      await invalidateWorkspaceFiles(queryClient)
    },
  })
}

export function useGenerateCommitMessage(sessionId: string) {
  return useMutation({
    mutationFn: (promptTemplate?: string) =>
      gitGenerateCommitMessage(sessionId, promptTemplate),
  })
}

// ── Stage / Unstage ───────────────────────────────────────────────────────────

export function useGitStage(sessionId: string) {
  const queryClient = useQueryClient()
  const invalidate = () => invalidateGitSession(queryClient, sessionId)
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

export function useGitStageAll(sessionId: string) {
  const queryClient = useQueryClient()
  const invalidate = () => invalidateGitSession(queryClient, sessionId)
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

// ── Stash ─────────────────────────────────────────────────────────────────────

export function useGitStashMutations(sessionId: string) {
  const queryClient = useQueryClient()

  const invalidateStatus = () => invalidateGitSession(queryClient, sessionId)
  const invalidateList = () =>
    queryClient.invalidateQueries({ queryKey: gitStashListKey(sessionId) })
  const invalidateWorkingTree = async () => {
    await invalidateStatus()
    await invalidateWorkspaceFiles(queryClient)
  }

  return {
    stash: useMutation({
      mutationFn: (message?: string) => gitStash(sessionId, message),
      onSuccess: invalidateWorkingTree,
    }),
    pop: useMutation({
      mutationFn: (ref: string) => gitStashPop(sessionId, ref),
      onSuccess: invalidateWorkingTree,
    }),
    apply: useMutation({
      mutationFn: (ref: string) => gitStashApply(sessionId, ref),
      onSuccess: invalidateWorkingTree,
    }),
    drop: useMutation({
      mutationFn: (ref: string) => gitStashDrop(sessionId, ref),
      onSuccess: invalidateList,
    }),
  }
}

// ── Revert file ───────────────────────────────────────────────────────────────

export function useGitRevertFile(sessionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ filePath, raw }: { filePath: string; raw: string }) =>
      gitRevertFile(sessionId, filePath, raw),
    onSuccess: async () => {
      await invalidateGitSession(queryClient, sessionId)
      await invalidateWorkspaceFiles(queryClient)
    },
  })
}

// ── Push / Fetch / Pull ───────────────────────────────────────────────────────

export function useGitPush(sessionId: string) {
  return useMutation({
    mutationFn: () => gitPush(sessionId),
  })
}

export function useGitFetch(sessionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => gitFetch(sessionId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: branchKey(sessionId) })
      await queryClient.invalidateQueries({ queryKey: gitStatusKey(sessionId) })
    },
  })
}

export function useGitPull(sessionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => gitPull(sessionId),
    onSuccess: async () => {
      await invalidateGitSession(queryClient, sessionId)
      await invalidateWorkspaceFiles(queryClient)
    },
  })
}

// ── Branch ────────────────────────────────────────────────────────────────────

export function useCheckoutBranch(sessionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (branch: string) => checkoutBranch(sessionId, branch),
    onSuccess: async () => {
      await invalidateGitSession(queryClient, sessionId)
      await invalidateWorkspaceFiles(queryClient)
    },
  })
}

export function useCreateBranch(sessionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (branch: string) => createBranch(sessionId, branch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: branchKey(sessionId) })
      queryClient.invalidateQueries({ queryKey: branchesKey(sessionId) })
    },
  })
}

export function useInitializeGitRepository(sessionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => initializeGitRepository(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: branchKey(sessionId) })
      queryClient.invalidateQueries({ queryKey: branchesKey(sessionId) })
      queryClient.invalidateQueries({ queryKey: gitStatusKey(sessionId) })
      queryClient.invalidateQueries({ queryKey: gitDiffStatKey(sessionId) })
    },
  })
}
