import { useEffect, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  fetchInstalledSkills,
  fetchPopularSkills,
  fetchSkillDetails,
  fetchSkillInstallJobs,
  fetchSkillSearch,
  installSkill,
  removeSkill,
} from "./api"
import type { SkillInstallJob } from "./types"

export const skillsKeys = {
  search: (query: string) => ["skills", "search", query] as const,
  popular: ["skills", "popular"] as const,
  details: (source: string) => ["skills", "details", source] as const,
  installed: ["skills", "installed"] as const,
  installs: ["skills", "installs"] as const,
}

/** Debounces a fast-changing value (e.g. search input) by `delayMs`. */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(id)
  }, [value, delayMs])
  return debounced
}

export function useSkillSearch(query: string) {
  const debounced = useDebouncedValue(query.trim(), 300)
  return useQuery({
    queryKey: skillsKeys.search(debounced),
    queryFn: ({ signal }) => fetchSkillSearch(debounced, signal),
    enabled: debounced.length >= 2,
    staleTime: 30 * 1000,
  })
}

export function usePopularSkills() {
  return useQuery({
    queryKey: skillsKeys.popular,
    queryFn: ({ signal }) => fetchPopularSkills(signal),
    staleTime: 5 * 60 * 1000,
  })
}

export function useSkillDetails(source: string | undefined) {
  return useQuery({
    queryKey: skillsKeys.details(source ?? ""),
    queryFn: ({ signal }) => fetchSkillDetails(source as string, signal),
    enabled: !!source,
    staleTime: 60 * 1000,
  })
}

export function useInstalledSkills() {
  return useQuery({
    queryKey: skillsKeys.installed,
    queryFn: ({ signal }) => fetchInstalledSkills(signal),
    staleTime: 10 * 1000,
  })
}

// Module-level (not per-component-instance) so a failed job is only ever
// toasted once even though useSkillInstallJobs is mounted on both the store
// page and the detail page.
const toastedFailureIds = new Set<string>()

/** Install jobs, polled every 2s while any install is running. */
export function useSkillInstallJobs() {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: skillsKeys.installs,
    queryFn: ({ signal }) => fetchSkillInstallJobs(signal),
    refetchInterval: (q) =>
      q.state.data?.some((job: SkillInstallJob) => job.status === "running")
        ? 2000
        : false,
  })

  // Refresh the installed list once the number of running jobs drops.
  const runningCount = query.data?.filter((j) => j.status === "running").length ?? 0
  const prevRunning = useRef(runningCount)
  useEffect(() => {
    if (runningCount < prevRunning.current) {
      void queryClient.invalidateQueries({ queryKey: skillsKeys.installed })
    }
    prevRunning.current = runningCount
  }, [runningCount, queryClient])

  // A job can fail asynchronously well after the POST that started it
  // resolved, so the failure has to be surfaced here (from the poll) rather
  // than from the mutation's onError.
  useEffect(() => {
    for (const job of query.data ?? []) {
      if (job.status !== "error" || toastedFailureIds.has(job.id)) continue
      toastedFailureIds.add(job.id)
      toast.error(`Couldn't install "${job.source}"`, {
        description: job.error,
      })
    }
  }, [query.data])

  return query
}

export function useInstallSkill() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (source: string) => installSkill(source),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: skillsKeys.installs })
    },
  })
}

export function useRemoveSkill() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => removeSkill(name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: skillsKeys.installed })
    },
  })
}
