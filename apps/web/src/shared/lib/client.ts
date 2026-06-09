import { electronServerPortQueryOptions } from "@/features/electron"
import { getServerToken } from "@/features/electron/api"

import { queryClient } from "./query-client"

let resolvedServerUrl: string | null = null
let resolvedServerToken: string | null = null

export function resetServerUrl(): void {
  resolvedServerUrl = null
  resolvedServerToken = null
}

const envToken = (): string | null =>
  (import.meta.env.VITE_SERVER_TOKEN as string | undefined) ?? null

/**
 * The per-launch bearer token the server requires. Resolved from the Electron
 * main process (or VITE_SERVER_TOKEN in standalone browser dev) and cached.
 * Returns null when no token is available (e.g. a server started with auth off).
 */
export function getResolvedServerToken(): string | null {
  return resolvedServerToken ?? envToken()
}

/**
 * Appends the auth token as a `?token=` query param. Used for URLs that can't
 * carry an Authorization header — WebSocket connections and `<img>`/media `src`.
 */
export function appendToken(url: string): string {
  const token = getResolvedServerToken()
  if (!token) return url
  const sep = url.includes("?") ? "&" : "?"
  return `${url}${sep}token=${encodeURIComponent(token)}`
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

/** Thrown when the server responds with a non-2xx status. */
export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

export async function getServerUrl(): Promise<string> {
  if (resolvedServerUrl) return resolvedServerUrl

  // Resolve the auth token alongside the URL so it's cached before any request
  // (including synchronous apiUrl()/`<img>` consumers) needs it.
  resolvedServerToken = envToken() ?? (await getServerToken())

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
  if (resolvedServerUrl) return appendToken(`${resolvedServerUrl}${path}`)
  const envUrl = import.meta.env.VITE_SERVER_URL as string | undefined
  if (envUrl) return appendToken(`${envUrl}${path}`)
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

  // Attach the bearer token (resolved during getServerUrl above) without
  // clobbering any caller-provided headers.
  const token = getResolvedServerToken()
  const headers = token
    ? { ...init?.headers, Authorization: `Bearer ${token}` }
    : init?.headers

  let res: Response
  try {
    res = await fetch(`${base}${path}`, { ...init, headers, signal })
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
    // Prefer the server's structured `{ error }` message when present, so
    // callers can show a readable message instead of a raw `API 500: {...}`.
    let message = text
    try {
      const parsed = JSON.parse(text) as { error?: unknown }
      if (parsed && typeof parsed.error === "string") message = parsed.error
    } catch {}
    throw new ApiError(res.status, message)
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
