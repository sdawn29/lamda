import { useQuery } from "@tanstack/react-query"
import { chatKeys } from "../queries"
import type { Message } from "../types"

// ── Scroll position ───────────────────────────────────────────────────────────

export interface ScrollMeta {
  scrollTop: number
  isPinned: boolean
}

export function useScrollMeta(sessionId: string) {
  return useQuery<ScrollMeta>({
    queryKey: chatKeys.scroll(sessionId),
    staleTime: Infinity,
    gcTime: 10 * 60 * 1000,
    enabled: !!sessionId,
  })
}

// ── Session-level errors ──────────────────────────────────────────────────────

export function useSessionErrors(sessionId: string) {
  return useQuery<Message[]>({
    queryKey: chatKeys.errors(sessionId),
    staleTime: Infinity,
    gcTime: 10 * 60 * 1000,
    enabled: !!sessionId,
  })
}

// ── Pending error (retry/compaction banners) ─────────────────────────────────

export interface PendingError {
  id: string
  title: string
  message: string
  retryable?: boolean
  retryCount?: number
  action?: {
    type: "retry"
    prompt?: string
  } | {
    type: "dismiss"
  } | {
    type: "continue"
  }
}

export function usePendingError(sessionId: string) {
  return useQuery<PendingError | null>({
    queryKey: chatKeys.pendingError(sessionId),
    staleTime: Infinity,
    gcTime: 10 * 60 * 1000,
    enabled: !!sessionId,
  })
}

// ── Bulk helpers for stream hook ─────────────────────────────────────────────

/**
 * Get the current scroll meta from cache (for non-reactive access).
 * Use inside requestAnimationFrame callbacks.
 */
export function getScrollMeta(
  queryClient: { getQueryData: <T>(key: readonly unknown[]) => T | undefined },
  sessionId: string
): ScrollMeta | undefined {
  return queryClient.getQueryData<ScrollMeta>(chatKeys.scroll(sessionId))
}

/**
 * Set scroll meta in cache
 */
export function setScrollMeta(
  queryClient: { setQueryData: <T>(key: readonly unknown[], value: T | ((old: T | undefined) => T)) => void },
  sessionId: string,
  meta: ScrollMeta
) {
  queryClient.setQueryData(chatKeys.scroll(sessionId), meta)
}

/**
 * Get session errors from cache
 */
export function getSessionErrors(
  queryClient: { getQueryData: <T>(key: readonly unknown[]) => T | undefined },
  sessionId: string
): Message[] {
  return queryClient.getQueryData<Message[]>(chatKeys.errors(sessionId)) ?? []
}

/**
 * Add a session-level error
 */
export function addSessionError(
  queryClient: { setQueryData: <T>(key: readonly unknown[], value: T | ((old: T | undefined) => T)) => void },
  sessionId: string,
  error: Message
) {
  queryClient.setQueryData(chatKeys.errors(sessionId), (old: Message[] | undefined) => [
    ...(old ?? []),
    error,
  ])
}

/**
 * Clear session-level errors (called when messages are reloaded)
 */
export function clearSessionErrors(
  queryClient: { setQueryData: <T>(key: readonly unknown[], value: T | ((old: T | undefined) => T)) => void },
  sessionId: string
) {
  queryClient.setQueryData(chatKeys.errors(sessionId), [])
}

/**
 * Set pending error
 */
export function setPendingError(
  queryClient: { setQueryData: <T>(key: readonly unknown[], value: T | ((old: T | undefined) => T)) => void },
  sessionId: string,
  error: PendingError | null
) {
  queryClient.setQueryData(chatKeys.pendingError(sessionId), error)
}