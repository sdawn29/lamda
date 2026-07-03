import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  createAutomation,
  deleteAutomation,
  fetchAllAutomations,
  fetchAutomationRuns,
  runAutomation,
  updateAutomation,
} from "./api"
import type { Automation, AutomationInput } from "./types"

const automationsKey = ["automations"] as const
const runsRootKey = ["automation-runs"] as const
const runsKey = (id: string) => [...runsRootKey, id] as const

export const automationKeys = {
  all: automationsKey,
  runs: runsKey,
  // Matches every automation's run-history query — for a broad "something
  // about some automation's runs changed" invalidation.
  runsAll: runsRootKey,
}

export function useAllAutomations() {
  return useQuery({
    queryKey: automationsKey,
    queryFn: ({ signal }) => fetchAllAutomations(signal),
    staleTime: 30 * 1000,
    // Poll while any automation is running so the row settles to ok/error.
    refetchInterval: (query) =>
      (query.state.data as Automation[] | undefined)?.some(
        (a) => a.lastStatus === "running"
      )
        ? 3000
        : false,
  })
}

export function useCreateAutomation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      workspaceId,
      input,
    }: {
      workspaceId: string
      input: AutomationInput
    }) => createAutomation(workspaceId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: automationsKey }),
  })
}

export function useUpdateAutomation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      updates,
    }: {
      id: string
      updates: Partial<AutomationInput>
    }) => updateAutomation(id, updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: automationsKey }),
  })
}

export function useDeleteAutomation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteAutomation(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: automationsKey }),
  })
}

export function useRunAutomation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => runAutomation(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: automationsKey })
      qc.invalidateQueries({ queryKey: runsKey(id) })
    },
  })
}

export function useAutomationRuns(id: string, enabled = true) {
  return useQuery({
    queryKey: runsKey(id),
    queryFn: ({ signal }) => fetchAutomationRuns(id, signal),
    enabled: enabled && !!id,
    staleTime: 10 * 1000,
    refetchInterval: (query) =>
      query.state.data?.some((r) => r.status === "running") ? 3000 : false,
  })
}
