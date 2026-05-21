import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { gitStatus, gitFileDiff, gitDiffStat, gitStashList, listTurns, revertToTurn, getAheadBehind, gitLog, gitShow, gitShowFiles, gitShowFileDiff } from "./api"
import { getBranch, listBranches } from "@/features/chat/api"

const gitRootKey = ["git"] as const
const gitSessionKey = (sessionId: string) =>
  [...gitRootKey, "session", sessionId] as const

export const gitKeys = {
  all: gitRootKey,
  session: gitSessionKey,
  status: (sessionId: string) =>
    [...gitSessionKey(sessionId), "status"] as const,
  fileDiff: (sessionId: string, filePath: string, statusCode: string) =>
    [...gitSessionKey(sessionId), "diff", filePath, statusCode] as const,
  diffStat: (sessionId: string) =>
    [...gitSessionKey(sessionId), "diff-stat"] as const,
  stashList: (sessionId: string) =>
    [...gitSessionKey(sessionId), "stash-list"] as const,
  branch: (sessionId: string) =>
    [...gitSessionKey(sessionId), "branch"] as const,
  branches: (sessionId: string) =>
    [...gitSessionKey(sessionId), "branches"] as const,
  turns: (sessionId: string) =>
    [...gitSessionKey(sessionId), "turns"] as const,
  aheadBehind: (sessionId: string) =>
    [...gitSessionKey(sessionId), "ahead-behind"] as const,
  log: (sessionId: string) =>
    [...gitSessionKey(sessionId), "log"] as const,
  show: (sessionId: string, sha: string) =>
    [...gitSessionKey(sessionId), "show", sha] as const,
  showFiles: (sessionId: string, sha: string) =>
    [...gitSessionKey(sessionId), "show-files", sha] as const,
  showFileDiff: (sessionId: string, sha: string, filePath: string) =>
    [...gitSessionKey(sessionId), "show-file-diff", sha, filePath] as const,
}

// ── Git status ────────────────────────────────────────────────────────────────

export const gitStatusKey = (sessionId: string) => gitKeys.status(sessionId)

export function useGitStatus(sessionId: string) {
  return useQuery({
    queryKey: gitStatusKey(sessionId),
    queryFn: () => gitStatus(sessionId),
    enabled: !!sessionId,
    staleTime: 0,
    refetchInterval: 3_000,
    placeholderData: { raw: "", isGitRepo: true },
  })
}

// ── Git file diff ─────────────────────────────────────────────────────────────

export const gitFileDiffKey = (
  sessionId: string,
  filePath: string,
  statusCode: string
) => gitKeys.fileDiff(sessionId, filePath, statusCode)

export function useGitFileDiff(
  sessionId: string,
  filePath: string,
  statusCode: string,
  enabled: boolean
) {
  return useQuery({
    queryKey: gitFileDiffKey(sessionId, filePath, statusCode),
    queryFn: () => gitFileDiff(sessionId, filePath, statusCode),
    enabled: enabled && !!sessionId && !!filePath,
    gcTime: 60 * 1000,
    staleTime: 0,
    refetchInterval: 3_000,
  })
}

// ── Git diff stat ─────────────────────────────────────────────────────────────

export const gitDiffStatKey = (sessionId: string) => gitKeys.diffStat(sessionId)

export function useGitDiffStat(sessionId: string) {
  return useQuery({
    queryKey: gitDiffStatKey(sessionId),
    queryFn: () => gitDiffStat(sessionId),
    enabled: !!sessionId,
    gcTime: 30 * 1000,
    staleTime: 0,
    refetchInterval: 3_000,
  })
}

// ── Stash list ────────────────────────────────────────────────────────────────

export const gitStashListKey = (sessionId: string) =>
  gitKeys.stashList(sessionId)

export function useGitStashList(sessionId: string) {
  return useQuery({
    queryKey: gitStashListKey(sessionId),
    queryFn: () => gitStashList(sessionId),
    enabled: !!sessionId,
    staleTime: 0,
  })
}

// ── Branch ────────────────────────────────────────────────────────────────────

export const branchKey = (sessionId: string) => gitKeys.branch(sessionId)

export function useBranch(sessionId: string) {
  return useQuery({
    queryKey: branchKey(sessionId),
    queryFn: () => getBranch(sessionId),
    enabled: !!sessionId,
    staleTime: 30_000,
  })
}

export const branchesKey = (sessionId: string) => gitKeys.branches(sessionId)

export function useBranches(sessionId: string) {
  return useQuery({
    queryKey: branchesKey(sessionId),
    queryFn: () => listBranches(sessionId),
    enabled: !!sessionId,
    staleTime: 30_000,
  })
}

// ── Git Log / Show ────────────────────────────────────────────────────────────

export function useGitLog(sessionId: string) {
  return useQuery({
    queryKey: gitKeys.log(sessionId),
    queryFn: () => gitLog(sessionId),
    enabled: !!sessionId,
    staleTime: 10_000,
  })
}

export function useGitShow(sessionId: string, sha: string, enabled: boolean) {
  return useQuery({
    queryKey: gitKeys.show(sessionId, sha),
    queryFn: () => gitShow(sessionId, sha),
    enabled: enabled && !!sessionId && !!sha,
    gcTime: 60_000,
    staleTime: Infinity,
  })
}

export function useGitShowFiles(sessionId: string, sha: string, enabled: boolean) {
  return useQuery({
    queryKey: gitKeys.showFiles(sessionId, sha),
    queryFn: () => gitShowFiles(sessionId, sha),
    enabled: enabled && !!sessionId && !!sha,
    gcTime: 5 * 60_000,
    staleTime: Infinity,
  })
}

export function useGitShowFileDiff(sessionId: string, sha: string, filePath: string, enabled: boolean) {
  return useQuery({
    queryKey: gitKeys.showFileDiff(sessionId, sha, filePath),
    queryFn: () => gitShowFileDiff(sessionId, sha, filePath),
    enabled: enabled && !!sessionId && !!sha && !!filePath,
    gcTime: 5 * 60_000,
    staleTime: Infinity,
  })
}

// ── Ahead / Behind ────────────────────────────────────────────────────────────

export function useAheadBehind(sessionId: string) {
  return useQuery({
    queryKey: gitKeys.aheadBehind(sessionId),
    queryFn: () => getAheadBehind(sessionId),
    enabled: !!sessionId,
    staleTime: 15_000,
  })
}

// ── Turn checkpoints (multi-turn history) ─────────────────────────────────────

export type { TurnSummary } from "./api"

export function useTurns(sessionId: string) {
  return useQuery({
    queryKey: gitKeys.turns(sessionId),
    queryFn: () => listTurns(sessionId),
    enabled: !!sessionId,
    staleTime: Infinity,
  })
}

export function useRevertToTurn(sessionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (turnId: number) => revertToTurn(sessionId, turnId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: gitKeys.status(sessionId) })
      void queryClient.invalidateQueries({ queryKey: gitKeys.diffStat(sessionId) })
      void queryClient.invalidateQueries({ queryKey: gitKeys.turns(sessionId) })
    },
    onError: (error: Error) => {
      console.error("[RevertToTurn] Error:", error.message)
    },
  })
}

