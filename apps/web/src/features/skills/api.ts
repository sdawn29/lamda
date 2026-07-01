import { apiFetch } from "@/shared/lib/client"
import type {
  InstalledSkill,
  SkillDetails,
  SkillInstallJob,
  SkillSearchResult,
} from "./types"

export async function fetchSkillSearch(
  query: string,
  signal?: AbortSignal
): Promise<SkillSearchResult[]> {
  const res = await apiFetch<{ skills: SkillSearchResult[] }>(
    `/skills/search?q=${encodeURIComponent(query)}`,
    { signal }
  )
  return res.skills
}

export async function fetchPopularSkills(
  signal?: AbortSignal
): Promise<SkillSearchResult[]> {
  const res = await apiFetch<{ skills: SkillSearchResult[] }>("/skills/popular", {
    signal,
  })
  return res.skills
}

export async function fetchSkillDetails(
  source: string,
  signal?: AbortSignal
): Promise<SkillDetails> {
  const res = await apiFetch<{ details: SkillDetails }>(
    `/skills/details?source=${encodeURIComponent(source)}`,
    { signal }
  )
  return res.details
}

export async function fetchInstalledSkills(
  signal?: AbortSignal
): Promise<InstalledSkill[]> {
  const res = await apiFetch<{ skills: InstalledSkill[] }>("/skills/installed", {
    signal,
  })
  return res.skills
}

export async function fetchSkillInstallJobs(
  signal?: AbortSignal
): Promise<SkillInstallJob[]> {
  const res = await apiFetch<{ jobs: SkillInstallJob[] }>("/skills/install", {
    signal,
  })
  return res.jobs
}

export async function installSkill(source: string): Promise<SkillInstallJob> {
  const res = await apiFetch<{ job: SkillInstallJob }>("/skills/install", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source }),
  })
  return res.job
}

export async function removeSkill(name: string): Promise<void> {
  await apiFetch(`/skills/${encodeURIComponent(name)}`, { method: "DELETE" })
}
