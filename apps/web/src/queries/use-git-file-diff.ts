import { useQuery } from "@tanstack/react-query"
import { gitFileDiff } from "@/api/git"

export const gitFileDiffKey = (
  sessionId: string,
  filePath: string,
  statusCode: string
) => ["git-diff", sessionId, filePath, statusCode] as const

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
    staleTime: 30_000,
  })
}
