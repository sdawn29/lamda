/**
 * Per-thread scroll position persistence.
 *
 * Keyed by threadId — the durable identity. (sessionIds rotate on every server
 * start, so anything keyed by sessionId is orphaned on each app relaunch.)
 *
 * Message content itself is deliberately NOT cached here: the server's SQLite
 * is the source of truth and sits on localhost, so transcripts are fetched on
 * demand and held only in react-query's in-memory cache. This store is the one
 * piece of chat state that must outlive the process.
 */

import { create } from "zustand"
import { persist } from "zustand/middleware"

const STORE_KEY = "lamda:scroll-meta"
// Bound the map so long-gone threads don't accumulate forever.
const MAX_ENTRIES = 200

// Old sessionId-keyed chat cache (messages + scroll positions). Unreadable
// after any app relaunch (sessionId rotation) and no longer written — clear it
// once so up to 50 MB of orphaned entries don't sit in localStorage forever.
const LEGACY_PREFIX = "lamda:chat:"

function clearLegacyChatCache(): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (key?.startsWith(LEGACY_PREFIX)) localStorage.removeItem(key)
    }
  } catch {
    // Best-effort cleanup only.
  }
}

if (typeof window !== "undefined") clearLegacyChatCache()

export interface ScrollMeta {
  /** Fallback restore position — used when there's no anchor, or the anchor row can't be found. */
  scrollTop: number
  isPinned: boolean
  /**
   * Anchor used to restore a scrolled-up (non-pinned) position: the group key
   * that sat at `anchorOffset` px from the viewport top when saved. Restoring
   * by re-locating this element and correcting by the offset is robust to
   * `content-visibility: auto` size estimates changing between visits, unlike
   * replaying the raw `scrollTop` (which drifts as the group elements below
   * an unmeasured position get remeasured with real, not estimated, heights).
   */
  anchorGroupKey?: string
  anchorOffset?: number
  /** Write timestamp — only used to evict the oldest entries past MAX_ENTRIES. */
  savedAt: number
}

interface ScrollMetaState {
  scroll: Record<string, ScrollMeta>
  setScroll: (threadId: string, meta: Omit<ScrollMeta, "savedAt">) => void
}

const useScrollMetaStore = create<ScrollMetaState>()(
  persist(
    (set) => ({
      scroll: {},

      setScroll: (threadId, meta) =>
        set((s) => {
          const scroll = {
            ...s.scroll,
            [threadId]: { ...meta, savedAt: Date.now() },
          }
          const ids = Object.keys(scroll)
          if (ids.length > MAX_ENTRIES) {
            ids
              .sort(
                (a, b) => (scroll[a].savedAt ?? 0) - (scroll[b].savedAt ?? 0)
              )
              .slice(0, ids.length - MAX_ENTRIES)
              .forEach((id) => delete scroll[id])
          }
          return { scroll }
        }),
    }),
    { name: STORE_KEY }
  )
)

export function saveScrollMeta(
  threadId: string,
  meta: Omit<ScrollMeta, "savedAt">
): void {
  useScrollMetaStore.getState().setScroll(threadId, meta)
}

export function loadScrollMeta(threadId: string): ScrollMeta | null {
  return useScrollMetaStore.getState().scroll[threadId] ?? null
}
