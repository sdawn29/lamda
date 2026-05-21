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
}

export async function fetchLspRegistry(
  signal?: AbortSignal,
): Promise<LspRegistryEntry[]> {
  const res = await apiFetch<{ languages: LspRegistryEntry[] }>("/lsp/registry", {
    signal,
  })
  return res.languages
}
