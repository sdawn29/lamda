import { apiFetch } from "@/shared/lib/client"
import type { Automation, AutomationInput, AutomationRun } from "./types"

export async function fetchAllAutomations(
  signal?: AbortSignal,
): Promise<Automation[]> {
  const res = await apiFetch<{ automations: Automation[] }>("/automations", {
    signal,
  })
  return res.automations
}

export async function createAutomation(
  workspaceId: string,
  input: AutomationInput,
): Promise<Automation> {
  const res = await apiFetch<{ automation: Automation }>(
    `/automations/${encodeURIComponent(workspaceId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  )
  return res.automation
}

export async function updateAutomation(
  id: string,
  updates: Partial<AutomationInput>,
): Promise<Automation> {
  const res = await apiFetch<{ automation: Automation }>(
    `/automations/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    },
  )
  return res.automation
}

export async function deleteAutomation(id: string): Promise<void> {
  await apiFetch(`/automations/${encodeURIComponent(id)}`, { method: "DELETE" })
}

/** Trigger a run. Fire-and-forget server-side; observe via run history refetch. */
export async function runAutomation(id: string): Promise<void> {
  await apiFetch(`/automations/${encodeURIComponent(id)}/run`, {
    method: "POST",
  })
}

export async function fetchAutomationRuns(
  id: string,
  signal?: AbortSignal,
): Promise<AutomationRun[]> {
  const res = await apiFetch<{ runs: AutomationRun[] }>(
    `/automations/${encodeURIComponent(id)}/runs`,
    { signal },
  )
  return res.runs
}
