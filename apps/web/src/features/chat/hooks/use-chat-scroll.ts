import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
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

interface UseChatScrollOptions {
  sessionId: string
  threadId: string
  /** Number of rendered message groups — drives auto-scroll. */
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
 * Position preservation across an older-history prepend (and across the height
 * corrections that `content-visibility: auto` produces while scrolling up) is
 * delegated to the browser's native CSS scroll anchoring — but only while the
 * user is reading history. The container's `overflow-anchor` tracks the pin
 * state (see `setPinned`): OFF while pinned (we actively force the view to the
 * bottom each growth frame, and anchoring would otherwise fight that), ON while
 * scrolled up (so prepends and CV height corrections never shift the view). The
 * streaming/last group is additionally excluded as an anchor candidate. The hook
 * only ever writes `scrollTop` while pinned; scrolled up, it never touches it.
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
  // are mutually exclusive: while pinned we actively own scrolling (force the
  // view to the bottom each growth frame), so anchoring is OFF — otherwise it
  // would try to hold an older element stationary and fight the bottom-follow,
  // most visibly right after sending a message from a scrolled-up position.
  // While the user is reading history (not pinned) anchoring is ON, so prepends
  // and content-visibility height corrections never shift the view.
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
    (scrollTop: number) => {
      pendingScrollMetaRef.current = {
        scrollTop,
        isPinned: pinnedRef.current,
        visited: true,
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
      // auto-follow snap catches up, and un-pinning there would kill autoscroll.
      if (scrolledUp) setPinned(false)
      else if (distanceFromBottom <= PIN_BOTTOM_THRESHOLD) setPinned(true)
      setButtonVisible(distanceFromBottom >= SHOW_BUTTON_THRESHOLD)
      saveScrollPosition(scrollTop)
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
  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return

    const interrupt = () => {
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
  const scrollToBottom = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    setPinned(true)
    setButtonVisible(false)
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    if (distanceFromBottom < 10) return
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
  }, [setButtonVisible, setPinned])

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
      el.scrollTop = savedMeta.scrollTop
      setPinned(savedMeta.isPinned)
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
  // Coarse events (turn state changes, new groups) — e.g. the user's just-sent
  // message. Instant snap — matches the ResizeObserver below so the two never
  // produce competing animations (the source of scroll jitter), and reads as
  // snappy. Anchoring is OFF while pinned, so this snap to the latest row wins.
  useLayoutEffect(() => {
    if (!pinnedRef.current || groupCount === 0) return
    const el = scrollContainerRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    if (distanceFromBottom < 5) return
    el.scrollTop = el.scrollHeight
  }, [isLoading, groupCount])

  // Keep the view glued to the bottom as content grows (word-reveal, streaming
  // text deltas). Instant snap only — incremental deltas are small enough to be
  // imperceptible, and stacking smooth scrolls causes jitter. Gated on `pinned`
  // so an older-history prepend (growth above the viewport, user scrolled up) is
  // left to native scroll anchoring instead.
  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return
    const ro = new ResizeObserver(() => {
      if (!pinnedRef.current) return
      const el = scrollContainerRef.current
      if (!el) return
      const distanceFromBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight
      if (distanceFromBottom < 1) return
      el.scrollTop = el.scrollHeight
    })
    ro.observe(container)
    return () => ro.disconnect()
  }, [])

  // When the bottom bar grows/shrinks (multi-line input, todo panel) keep the
  // bottom pinned so the latest message stays glued to the top of the bar.
  useLayoutEffect(() => {
    if (!pinnedRef.current) return
    const el = scrollContainerRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [bottomBarHeight])

  return {
    scrollContainerRef,
    messagesContainerRef,
    showScrollButton,
    onScroll,
    scrollToBottom,
    pinToBottom,
  }
}
