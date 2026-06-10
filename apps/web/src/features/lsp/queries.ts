import { useEffect, useRef } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  fetchLspInstallJobs,
  fetchLspRegistry,
  installLspServer,
  type LspInstallJob,
} from "./api"

export const lspKeys = {
  all: ["lsp"] as const,
  registry: ["lsp", "registry"] as const,
  installs: ["lsp", "installs"] as const,
}

export function useLspRegistry() {
  return useQuery({
    queryKey: lspKeys.registry,
    queryFn: ({ signal }) => fetchLspRegistry(signal),
    staleTime: 30 * 1000,
  })
}

/**
 * Install jobs, polled every 2s while any install is running. When a job
 * finishes, the registry is refetched so the row flips to Installed.
 */
export function useLspInstallJobs() {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: lspKeys.installs,
    queryFn: ({ signal }) => fetchLspInstallJobs(signal),
    refetchInterval: (q) =>
      q.state.data?.some((job: LspInstallJob) => job.status === "running")
        ? 2000
        : false,
  })

  // Refresh the registry once the number of running jobs drops.
  const runningCount = query.data?.filter((j) => j.status === "running").length ?? 0
  const prevRunning = useRef(runningCount)
  useEffect(() => {
    if (runningCount < prevRunning.current) {
      void queryClient.invalidateQueries({ queryKey: lspKeys.registry })
    }
    prevRunning.current = runningCount
  }, [runningCount, queryClient])

  return query
}

export function useInstallLspServer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (language: string) => installLspServer(language),
    onError: (err) => {
      toast.error("Could not start install", {
        description: err instanceof Error ? err.message : String(err),
      })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: lspKeys.installs })
    },
  })
}
