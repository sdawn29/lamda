import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import type { QueryClient } from "@tanstack/react-query"
import { chatKeys } from "../queries"
import type { getChatSyncEngine } from "./use-chat-sync-engine"
import type { ScrollMeta } from "./use-chat-sync-engine"

// Distance (px) from the bottom at which we consider the user "at the bottom"
// and resume auto-following. Deliberately tight: once the user scrolls up past
// this we stop yanking them back, and only re-pin when they return near the very
// bottom — this is what keeps streaming from fighting the user's scroll.
const PIN_BOTTOM_THRESHOLD = 24
// Distance (px) past which the "scroll to bottom" affordance appears.
const SHOW_BUTTON_THRESHOLD = 80
// Distance (px) from the top at which older history starts auto-loading. Set
// generously so the next page is fetched before the user reaches the very top,
// keeping upward scrolling seamless (there is no manual "load earlier" button).
const LOAD_OLDER_THRESHOLD = 600
// Debounce for persisting scroll position to the query cache / localStorage.
const SCROLL_SAVE_DEBOUNCE_MS = 150
// Eased follow: fraction of the remaining distance closed per frame. Lower =
// smoother/slower catch-up, higher = snappier. Below FOLLOW_SNAP_PX the eased
// loop just snaps to the target and stops, so it never spins forever chasing a
// sub-pixel remainder.
const FOLLOW_EASE = 0.3
const FOLLOW_SNAP_PX = 0.5

interface ScrollAnchor {
  groupKey: string
  offset: number
}

let reducedMotionQuery: MediaQueryList | null | undefined
function prefersReducedMotion(): boolean {
  if (reducedMotionQuery === undefined) {
    reducedMotionQuery =
      typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null
  }
  return reducedMotionQuery?.matches ?? false
}

/**
 * Topmost group still (at least partially) below the viewport top, plus its
 * pixel offset from the viewport top. Used instead of a raw scrollTop for
 * restoring a scrolled-up position — see the `anchorGroupKey` doc on
 * `ScrollMeta` for why.
 */
function findScrollAnchor(
  scrollEl: HTMLElement,
  contentEl: HTMLElement
): ScrollAnchor | null {
  const viewportTop = scrollEl.getBoundingClientRect().top
  const groups = contentEl.querySelectorAll<HTMLElement>("[data-group-key]")
  for (const g of groups) {
    const rect = g.getBoundingClientRect()
    if (rect.bottom > viewportTop) {
      return {
        groupKey: g.dataset.groupKey ?? "",
        offset: rect.top - viewportTop,
      }
    }
  }
  return null
}

interface UseChatScrollOptions {
  sessionId: string
  threadId: string
  /** Number of rendered message groups (gates the one-time restore). */
  groupCount: number
  /** Agent is actively streaming a turn. */
  isLoading: boolean
  /** Initial page of messages is still loading (gates the one-time restore). */
  isLoadingMessages: boolean
  hasPreviousPage: boolean
  isFetchingPreviousPage: boolean
  fetchPreviousPage: () => void
  /** Height of the floating bottom bar; growth re-pins to keep the latest row glued. */
  bottomBarHeight: number
  queryClient: QueryClient
  syncEngine: ReturnType<typeof getChatSyncEngine>
}

export interface UseChatScrollResult {
  /** Attach to the scrolling viewport element. */
  scrollContainerRef: React.RefObject<HTMLDivElement | null>
  /** Attach to the inner content element (observed for streaming growth). */
  messagesContainerRef: React.RefObject<HTMLDivElement | null>
  /** Whether the "scroll to bottom" button should be shown. */
  showScrollButton: boolean
  /** onScroll handler for the viewport. */
  onScroll: () => void
  /** Smoothly scroll to the bottom and resume auto-following (button / shortcut). */
  scrollToBottom: () => void
  /** Instantly jump to the bottom and pin (used when sending a message). */
  pinToBottom: () => void
}

/**
 * Owns every scroll concern for the chat transcript:
 *   • stick-to-bottom while the agent streams, without fighting the user
 *   • one-time restore of a saved position (or jump to bottom) per thread
 *   • position persistence (debounced) to the query cache + localStorage
 *   • auto-loading older history as the user nears the top
 *   • the "scroll to bottom" affordance
 *
 * While pinned, a single eased rAF loop (`easeToBottom`) owns every follow:
 * content growth, the scroll-to-bottom button, and the post-turn settle all
 * glide toward the live bottom by closing a fraction of the remaining distance
 * each frame. One mechanism means the sources can never fight each other —
 * the loop re-reads the target from live scrollHeight every frame, so growth
 * mid-glide just extends the same glide. The only instant jumps left are the
 * ones that must land before paint: the per-thread restore, `pinToBottom` on
 * send, and bottom-bar resizes (viewport height changes under the content).
 *
 * Position preservation across an older-history prepend (and across the height
 * corrections that `content-visibility: auto` produces while scrolling up) is
 * delegated to the browser's native CSS scroll anchoring — but only while the
 * user is reading history. The container's `overflow-anchor` tracks the pin
 * state (see `setPinned`): OFF while pinned (we actively drive the view to the
 * bottom, and anchoring would otherwise fight that), ON while scrolled up (so
 * prepends and CV height corrections never shift the view). The hook only ever
 * writes `scrollTop` while pinned; scrolled up, it never touches it.
 */
export function useChatScroll({
  sessionId,
  threadId,
  groupCount,
  isLoading,
  isLoadingMessages,
  hasPreviousPage,
  isFetchingPreviousPage,
  fetchPreviousPage,
  bottomBarHeight,
  queryClient,
  syncEngine,
}: UseChatScrollOptions): UseChatScrollResult {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  // Whether we're auto-following the bottom of the transcript.
  const pinnedRef = useRef(true)
  // Last observed scrollTop — lets us detect the *direction* of a scroll so an
  // upward move (scrollbar drag included) is read as the user taking over.
  const lastScrollTopRef = useRef(0)

  // Pin state also drives native CSS scroll anchoring on the container. The two
  // are mutually exclusive: while pinned we actively own scrolling (drive the
  // view to the bottom on growth), so anchoring is OFF — otherwise it would try
  // to hold an older element stationary and fight the bottom-follow, most
  // visibly right after sending a message from a scrolled-up position. While
  // the user is reading history (not pinned) anchoring is ON, so prepends and
  // content-visibility height corrections never shift the view.
  const setPinned = useCallback((value: boolean) => {
    pinnedRef.current = value
    const el = scrollContainerRef.current
    if (el) el.style.overflowAnchor = value ? "none" : "auto"
  }, [])

  const [showScrollButton, setShowScrollButton] = useState(false)

  // Functional update bails out (React skips the re-render) when the value is
  // unchanged — safe to call on every scroll frame.
  const setButtonVisible = useCallback((visible: boolean) => {
    setShowScrollButton((prev) => (prev === visible ? prev : visible))
  }, [])

  // ── Bottom followers ──────────────────────────────────────────────────────
  // Instant snap. Reserved for moves that must land before paint (restore,
  // send, viewport resize); everything else goes through easeToBottom.
  const snapToBottom = useCallback(() => {
    if (!pinnedRef.current) return
    const el = scrollContainerRef.current
    if (!el) return
    const max = el.scrollHeight - el.clientHeight
    if (el.scrollTop < max) el.scrollTop = max
  }, [])

  // The eased follow loop. Recomputes the target from live scrollHeight each
  // frame, so it naturally tracks content that keeps growing mid-glide rather
  // than easing toward a stale target. Self-terminates once within
  // FOLLOW_SNAP_PX, and bails immediately if the user takes over (pinnedRef
  // cleared) — re-entrant calls just let the running loop keep going toward
  // the latest target. Respects prefers-reduced-motion by snapping instead.
  const followRafRef = useRef<number | null>(null)
  const easeToBottom = useCallback(() => {
    if (!pinnedRef.current || followRafRef.current !== null) return
    if (prefersReducedMotion()) {
      snapToBottom()
      return
    }
    const step = () => {
      const el = scrollContainerRef.current
      if (!pinnedRef.current || !el) {
        followRafRef.current = null
        return
      }
      const max = el.scrollHeight - el.clientHeight
      const delta = max - el.scrollTop
      if (delta <= FOLLOW_SNAP_PX) {
        if (delta > 0) el.scrollTop = max
        followRafRef.current = null
        return
      }
      el.scrollTop += delta * FOLLOW_EASE
      followRafRef.current = requestAnimationFrame(step)
    }
    followRafRef.current = requestAnimationFrame(step)
  }, [snapToBottom])

  useEffect(
    () => () => {
      if (followRafRef.current !== null) {
        cancelAnimationFrame(followRafRef.current)
        followRafRef.current = null
      }
    },
    []
  )

  // ── Position persistence (debounced) ──────────────────────────────────────
  const pendingScrollMetaRef = useRef<ScrollMeta | null>(null)
  const scrollSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  )
  const flushScrollMeta = useCallback(() => {
    const meta = pendingScrollMetaRef.current
    if (!meta) return
    pendingScrollMetaRef.current = null
    queryClient.setQueryData(chatKeys.scroll(sessionId), meta)
    syncEngine.saveScrollMeta(sessionId, meta)
  }, [queryClient, sessionId, syncEngine])

  const saveScrollPosition = useCallback(
    (scrollTop: number, anchor: ScrollAnchor | null) => {
      pendingScrollMetaRef.current = {
        scrollTop,
        isPinned: pinnedRef.current,
        visited: true,
        anchorGroupKey: anchor?.groupKey,
        anchorOffset: anchor?.offset,
      }
      if (scrollSaveTimeoutRef.current !== null) return
      scrollSaveTimeoutRef.current = setTimeout(() => {
        scrollSaveTimeoutRef.current = null
        flushScrollMeta()
      }, SCROLL_SAVE_DEBOUNCE_MS)
    },
    [flushScrollMeta]
  )

  // Flush the last pending write on unmount so the final scroll position
  // survives a thread switch / reload.
  useEffect(() => {
    return () => {
      if (scrollSaveTimeoutRef.current !== null) {
        clearTimeout(scrollSaveTimeoutRef.current)
        scrollSaveTimeoutRef.current = null
        flushScrollMeta()
      }
    }
  }, [flushScrollMeta])

  // ── Scroll event processing (rAF-throttled) ───────────────────────────────
  // Reads layout (scrollHeight) which `content-visibility: auto` makes costly,
  // so it runs at most once per frame. Reassigned every render so it closes over
  // fresh query state (`hasPreviousPage` / `isFetchingPreviousPage`).
  const processScrollRef = useRef<() => void>(() => {})
  const scrollRafRef = useRef<number | null>(null)
  const onScroll = useCallback(() => {
    if (scrollRafRef.current !== null) return
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null
      processScrollRef.current()
    })
  }, [])

  useEffect(() => {
    processScrollRef.current = () => {
      const el = scrollContainerRef.current
      if (!el) return
      const scrollTop = el.scrollTop
      const distanceFromBottom = el.scrollHeight - scrollTop - el.clientHeight
      // Movement up since the last frame, beyond a small jitter tolerance — the
      // user taking over (catches scrollbar drag the wheel/touch listeners miss).
      // Gated on still being away from the bottom: while pinned, content
      // *shrinking* below us (a tool block collapsing, the thinking indicator
      // clearing at turn end, a word-reveal reflow) lowers scrollHeight and the
      // browser clamps scrollTop down — an upward move that must NOT be read as
      // the user scrolling away, or auto-follow would silently die mid-stream.
      // A real scroll-up moves us off the bottom; a clamp leaves us glued to it.
      const scrolledUp =
        scrollTop < lastScrollTopRef.current - 2 &&
        distanceFromBottom > PIN_BOTTOM_THRESHOLD
      lastScrollTopRef.current = scrollTop

      // Auto-load older history before the user reaches the very top. Position
      // preservation across the prepend is handled by native scroll anchoring,
      // so there's no anchor to capture; re-entrancy is guarded here.
      if (
        scrollTop < LOAD_OLDER_THRESHOLD &&
        hasPreviousPage &&
        !isFetchingPreviousPage
      ) {
        fetchPreviousPage()
      }

      // Only ever UN-pin on a genuine upward move; only ever RE-pin when the
      // user lands back near the bottom. Crucially we do NOT un-pin just because
      // `distanceFromBottom` grew — appending the just-sent message (or streaming
      // text) below the viewport spikes that distance for a frame before the
      // auto-follow catches up, and un-pinning there would kill autoscroll.
      if (scrolledUp) setPinned(false)
      else if (distanceFromBottom <= PIN_BOTTOM_THRESHOLD) setPinned(true)
      setButtonVisible(distanceFromBottom >= SHOW_BUTTON_THRESHOLD)

      // Only needed to restore a scrolled-up position — pinned always restores
      // to the live bottom, so skip the extra DOM query while streaming.
      const content = messagesContainerRef.current
      const anchor =
        !pinnedRef.current && content ? findScrollAnchor(el, content) : null
      saveScrollPosition(scrollTop, anchor)
    }
  })

  useEffect(
    () => () => {
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current)
        scrollRafRef.current = null
      }
    },
    []
  )

  // ── User-intent detection ─────────────────────────────────────────────────
  // Any upward gesture immediately stops auto-following so streaming/auto-scroll
  // never fights the user. These listeners only fire for genuine user input —
  // programmatic scrollTop changes don't dispatch wheel/touch/key events.
  // Gated on the transcript actually overflowing: on a short thread nothing can
  // scroll, so no scroll event could ever re-pin — an accidental up-tick there
  // would otherwise kill auto-follow for good.
  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return

    const interrupt = () => {
      if (el.scrollHeight - el.clientHeight <= 1) return
      setPinned(false)
    }

    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) interrupt()
    }
    let touchStartY = 0
    const onTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0]?.clientY ?? 0
    }
    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY ?? 0
      // Finger moving down drags the content up (scrolling toward older messages).
      if (y - touchStartY > 4) interrupt()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp" || e.key === "PageUp" || e.key === "Home") {
        interrupt()
      }
    }

    el.addEventListener("wheel", onWheel, { passive: true })
    el.addEventListener("touchstart", onTouchStart, { passive: true })
    el.addEventListener("touchmove", onTouchMove, { passive: true })
    el.addEventListener("keydown", onKeyDown)
    return () => {
      el.removeEventListener("wheel", onWheel)
      el.removeEventListener("touchstart", onTouchStart)
      el.removeEventListener("touchmove", onTouchMove)
      el.removeEventListener("keydown", onKeyDown)
    }
  }, [setPinned])

  // ── Imperative scrollers ──────────────────────────────────────────────────
  // Button / shortcut: glide down via the same eased loop that owns streaming
  // follow. Using one mechanism (not scrollTo({behavior:"smooth"})) matters:
  // a native smooth scroll is cancelled by any programmatic scrollTop write,
  // so growth landing mid-animation used to teleport the view instead.
  const scrollToBottom = useCallback(() => {
    setPinned(true)
    setButtonVisible(false)
    easeToBottom()
  }, [easeToBottom, setButtonVisible, setPinned])

  const pinToBottom = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    setPinned(true)
    setButtonVisible(false)
    el.scrollTop = el.scrollHeight
  }, [setButtonVisible, setPinned])

  // ── One-time restore (or jump to bottom) per thread ───────────────────────
  // useLayoutEffect applies the position before paint — no flash of the wrong
  // spot. Deferred until the initial page has rendered: applying a saved
  // scrollTop against an empty container clamps to 0 and strands the view.
  const scrollRestoredSessionRef = useRef<string | null>(null)
  useLayoutEffect(() => {
    if (scrollRestoredSessionRef.current === sessionId) return
    const el = scrollContainerRef.current
    if (!el) return
    if (groupCount === 0 && isLoadingMessages) return
    scrollRestoredSessionRef.current = sessionId

    setPinned(true)

    let savedMeta = queryClient.getQueryData<ScrollMeta>(
      chatKeys.scroll(sessionId)
    )
    if (!savedMeta?.visited) {
      const localMeta = syncEngine.getScrollMeta(sessionId)
      if (localMeta) savedMeta = localMeta
    }

    if (savedMeta?.visited) {
      setPinned(savedMeta.isPinned)
      // Pinned always means "the live bottom" — recompute it fresh rather than
      // replaying the old scrollTop, which lines up with a snapshot of
      // scrollHeight that may no longer match (see anchorGroupKey doc).
      const contentEl = messagesContainerRef.current
      const anchorEl =
        !savedMeta.isPinned && savedMeta.anchorGroupKey && contentEl
          ? contentEl.querySelector<HTMLElement>(
              `[data-group-key="${CSS.escape(savedMeta.anchorGroupKey)}"]`
            )
          : null
      if (anchorEl) {
        const anchorTop = anchorEl.getBoundingClientRect().top
        const viewportTop = el.getBoundingClientRect().top
        el.scrollTop += anchorTop - viewportTop - (savedMeta.anchorOffset ?? 0)
      } else {
        el.scrollTop = el.scrollHeight
      }
    } else {
      el.scrollTop = el.scrollHeight
      const visitedMeta: ScrollMeta = {
        scrollTop: el.scrollTop,
        isPinned: pinnedRef.current,
        visited: true,
      }
      queryClient.setQueryData(chatKeys.scroll(sessionId), visitedMeta)
      syncEngine.saveScrollMeta(sessionId, visitedMeta)
    }

    lastScrollTopRef.current = el.scrollTop
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    setButtonVisible(distanceFromBottom >= SHOW_BUTTON_THRESHOLD)
  }, [
    threadId,
    sessionId,
    queryClient,
    syncEngine,
    groupCount,
    isLoadingMessages,
    setButtonVisible,
    setPinned,
  ])

  // ── Auto-follow new content while pinned ──────────────────────────────────
  // A single ResizeObserver on the content box covers every growth source —
  // streamed text, a tool row landing, a thinking block appearing, a new group
  // mounting — and glides the view down through the eased loop. Gated on
  // `pinned` (inside easeToBottom) so an older-history prepend (growth above a
  // scrolled-up viewport) is left to native scroll anchoring instead. Shrinks
  // need no handling: the browser clamps scrollTop to the new max, which keeps
  // a pinned view glued to the bottom by itself.
  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return
    const ro = new ResizeObserver(() => {
      easeToBottom()
    })
    ro.observe(container)
    return () => ro.disconnect()
  }, [easeToBottom])

  // When the bottom bar grows/shrinks (multi-line input, todo panel, queued pill)
  // the scroll viewport's height changes — keep the latest row glued to its top.
  // Instant: easing here reads as the transcript lagging behind the input box.
  useLayoutEffect(() => {
    snapToBottom()
  }, [bottomBarHeight, snapToBottom])

  // A turn keeps reflowing for a beat *after* it ends — the working block
  // collapses (~300ms grid animation) and the persisted-message refetch swaps the
  // streamed rows for stored ones (~750ms). Those can land without a growth
  // resize, so without this the view drifts ("bounces") as the content settles
  // below the fold. Hold the bottom glued across a short window once loading
  // ends; bail the instant the user scrolls up (pinnedRef cleared by the
  // wheel/touch listeners), so it never fights them.
  const prevIsLoadingRef = useRef(isLoading)
  useEffect(() => {
    const wasLoading = prevIsLoadingRef.current
    prevIsLoadingRef.current = isLoading
    if (!(wasLoading && !isLoading) || !pinnedRef.current) return
    let raf = 0
    const start = performance.now()
    const tick = () => {
      if (!pinnedRef.current) return
      easeToBottom()
      if (performance.now() - start < 900) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [isLoading, easeToBottom])

  return {
    scrollContainerRef,
    messagesContainerRef,
    showScrollButton,
    onScroll,
    scrollToBottom,
    pinToBottom,
  }
}
