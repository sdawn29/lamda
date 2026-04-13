import { useQuery } from "@tanstack/react-query"
import { gitStatus, gitFileDiff, gitDiffStat, gitStashList } from "./api"
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
}

// ── Git status ────────────────────────────────────────────────────────────────

export const gitStatusKey = (sessionId: string) => gitKeys.status(sessionId)

export function useGitStatus(sessionId: string) {
  return useQuery({
    queryKey: gitStatusKey(sessionId),
    queryFn: () => gitStatus(sessionId),
    enabled: !!sessionId,
    staleTime: 0,
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
    staleTime: 30_000,
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
    refetchInterval: () =>
      typeof document === "undefined" || document.visibilityState !== "visible"
        ? false
        : 5000,
    refetchIntervalInBackground: false,
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
