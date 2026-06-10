import { apiFetch } from "@/shared/lib/client"

export interface LspRegistryFallback {
  command: string
  args: string[]
  installed: boolean
}

export interface LspRegistryEntry {
  language: string
  extensions: string[]
  command: string
  args: string[]
  installed: boolean
  fallbacks: LspRegistryFallback[]
  /** True if the primary command or any fallback is installed on PATH. */
  available: boolean
  /** True when the server can install this language server right now. */
  installable: boolean
  /** Full command the server would run, e.g. "npm install -g pyright". */
  installCommand: string | null
  /** Package manager needed for the install recipe (e.g. "npm"), if any. */
  requiredTool: string | null
}

export type LspInstallStatus = "running" | "success" | "error"

export interface LspInstallJob {
  language: string
  target: string
  commandLine: string
  status: LspInstallStatus
  output: string
  startedAt: number
  finishedAt?: number
}

export async function fetchLspRegistry(
  signal?: AbortSignal,
): Promise<LspRegistryEntry[]> {
  const res = await apiFetch<{ languages: LspRegistryEntry[] }>("/lsp/registry", {
    signal,
  })
  return res.languages
}

export async function fetchLspInstallJobs(
  signal?: AbortSignal,
): Promise<LspInstallJob[]> {
  const res = await apiFetch<{ jobs: LspInstallJob[] }>("/lsp/install", {
    signal,
  })
  return res.jobs
}

export async function installLspServer(language: string): Promise<LspInstallJob> {
  const res = await apiFetch<{ job: LspInstallJob }>("/lsp/install", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ language }),
  })
  return res.job
}
