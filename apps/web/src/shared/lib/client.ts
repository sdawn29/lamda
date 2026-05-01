import { electronServerPortQueryOptions } from "@/features/electron"

import { queryClient } from "./query-client"

let resolvedServerUrl: string | null = null

export function resetServerUrl(): void {
  resolvedServerUrl = null
}

export class ServerUnreachableError extends Error {
  readonly isServerUnreachable = true

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = "ServerUnreachableError"
  }
}

export function isServerUnreachableError(
  error: unknown
): error is ServerUnreachableError {
  return (
    error instanceof Error &&
    (error as { isServerUnreachable?: boolean }).isServerUnreachable === true
  )
}

export async function getServerUrl(): Promise<string> {
  if (resolvedServerUrl) return resolvedServerUrl

  if (import.meta.env.VITE_SERVER_URL) {
    resolvedServerUrl = import.meta.env.VITE_SERVER_URL as string
    return resolvedServerUrl
  }

  const port = await queryClient.ensureQueryData(
    electronServerPortQueryOptions()
  )
  if (port === null || port === undefined) {
    throw new ServerUnreachableError(
      "Server is not available — port has not been assigned."
    )
  }
  resolvedServerUrl = `http://localhost:${port}`
  return resolvedServerUrl
}

export async function getServerWsUrl(): Promise<string> {
  const httpUrl = await getServerUrl()
  return httpUrl.replace(/^http/, "ws")
}

export function apiUrl(path: string): string {
  if (resolvedServerUrl) return `${resolvedServerUrl}${path}`
  const envUrl = import.meta.env.VITE_SERVER_URL as string | undefined
  if (envUrl) return `${envUrl}${path}`
  throw new ServerUnreachableError(
    "apiUrl called before server URL was resolved."
  )
}

// Default request timeout in milliseconds
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000

export async function apiFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const base = await getServerUrl()
  
  // Create abort controller for timeout
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_REQUEST_TIMEOUT_MS)
  
  // Merge signals if parent signal provided
  let signal: AbortSignal | undefined = controller.signal
  if (init?.signal) {
    // Combine parent signal with timeout signal
    // If either aborts, the request should be cancelled
    signal = anySignal([init.signal, controller.signal])
    // When parent aborts, clear the timeout to avoid unnecessary abort
    init.signal.addEventListener("abort", () => clearTimeout(timeoutId), { once: true })
  }

  let res: Response
  try {
    res = await fetch(`${base}${path}`, { ...init, signal })
  } catch (err) {
    clearTimeout(timeoutId)
    // Ignore abort errors - they are expected when canceling requests
    if (err instanceof Error) {
      if (err.name === "AbortError") {
        throw err
      }
      // Check if it's a timeout error
      if (err.message?.includes("abort") || err.message?.includes("timeout")) {
        throw new Error(`Request timeout (${DEFAULT_REQUEST_TIMEOUT_MS / 1000}s)`, { cause: err })
      }
    }
    throw new ServerUnreachableError(
      err instanceof Error
        ? `Server unreachable: ${err.message}`
        : "Server unreachable",
      { cause: err }
    )
  }
  
  clearTimeout(timeoutId)
  
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`API ${res.status}: ${text}`)
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as T
  }
  return res.json() as Promise<T>
}

/**
 * Create a signal that aborts when any of the given signals abort.
 */
function anySignal(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController()
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason)
      break
    }
    signal.addEventListener("abort", () => controller.abort(signal.reason), {
      signal: controller.signal,
    })
  }
  return controller.signal
}
