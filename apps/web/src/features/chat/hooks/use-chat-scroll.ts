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
// bottom — this is what keeps streaming from fighting the user's scroll. (The
// previous behaviour re-pinned anywhere within 80px, so streaming repeatedly
// snapped a reading user back down.)
const PIN_BOTTOM_THRESHOLD = 24
// Distance (px) past which the "scroll to bottom" affordance appears.
const SHOW_BUTTON_THRESHOLD = 80
// Trigger loading older history once the user scrolls within this of the top.
const LOAD_OLDER_THRESHOLD = 200
// Safety net for clearing the programmatic-scroll guard if `scrollend` never
// fires (older Safari, or an instant scroll that doesn't actually move).
const PROGRAMMATIC_FALLBACK_MS = 600
// Debounce for persisting scroll position to the query cache / localStorage.
const SCROLL_SAVE_DEBOUNCE_MS = 150

// Find the first message group at or below the scroll viewport's top edge. This
// is the element we pin in place across an older-history prepend: it's on-screen,
// so it has a real (non-estimated) measured height and rect, making it a reliable
// anchor regardless of content-visibility estimates for off-screen groups.
function captureTopGroupAnchor(
  container: HTMLElement
): { key: string; top: number } | null {
  const containerTop = container.getBoundingClientRect().top
  const nodes = container.querySelectorAll<HTMLElement>("[data-group-key]")
  for (const node of nodes) {
    const rect = node.getBoundingClientRect()
    if (rect.bottom > containerTop) {
      const key = node.getAttribute("data-group-key")
      if (key) return { key, top: rect.top }
    }
  }
  return null
}

// Locate a group element by its data-group-key. Iterates rather than using a
// selector so keys containing CSS-special characters need no escaping.
function findGroupByKey(
  container: HTMLElement,
  key: string
): HTMLElement | null {
  const nodes = container.querySelectorAll<HTMLElement>("[data-group-key]")
  for (const node of nodes) {
    if (node.getAttribute("data-group-key") === key) return node
  }
  return null
}

interface UseChatScrollOptions {
  sessionId: string
  threadId: string
  /** Number of rendered message groups — drives auto-scroll + prepend restore. */
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
  /** Load older history while preserving the user's scroll position. */
  loadOlder: () => void
}

/**
 * Owns every scroll concern for the chat transcript:
 *   • stick-to-bottom while the agent streams, without fighting the user
 *   • one-time restore of a saved position (or jump to bottom) per thread
 *   • position persistence (debounced) to the query cache + localStorage
 *   • position-preserving prepend of older history
 *   • the "scroll to bottom" affordance
 *
 * The pin model is intent-driven: any upward user gesture (wheel / touch /
 * keyboard) immediately stops auto-following, and we only resume once the user
 * is back at the very bottom. Programmatic scrolls are guarded so they don't get
 * mistaken for user input.
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
  // True while a programmatic scroll is in flight; onScroll ignores pin/button
  // updates during this window so our own scrolling isn't read as user intent.
  const programmaticScrollRef = useRef(false)
  const programmaticTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  )

  const [showScrollButton, setShowScrollButton] = useState(false)

  // Functional update bails out (React skips the re-render) when the value is
  // unchanged — safe to call on every scroll frame.
  const setButtonVisible = useCallback((visible: boolean) => {
    setShowScrollButton((prev) => (prev === visible ? prev : visible))
  }, [])

  // ── Programmatic-scroll guard ─────────────────────────────────────────────
  const clearProgrammatic = useCallback(() => {
    programmaticScrollRef.current = false
    if (programmaticTimeoutRef.current !== null) {
      clearTimeout(programmaticTimeoutRef.current)
      programmaticTimeoutRef.current = null
    }
  }, [])

  const armProgrammatic = useCallback(() => {
    programmaticScrollRef.current = true
    // Keep a single pending fallback timer; repeated calls during streaming
    // (every ResizeObserver snap) must not churn timers.
    if (programmaticTimeoutRef.current !== null) return
    programmaticTimeoutRef.current = setTimeout(() => {
      programmaticTimeoutRef.current = null
      programmaticScrollRef.current = false
    }, PROGRAMMATIC_FALLBACK_MS)
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

  // ── Older-history loading (position-preserving) ───────────────────────────
  const prevGroupCountRef = useRef(groupCount)
  const prependAnchorRef = useRef<{ key: string; top: number } | null>(null)
  const isLoadingOlderRef = useRef(false)

  // These hold the latest closures so the stable callbacks below always read
  // fresh query state. They're (re)assigned in an effect rather than during
  // render so we never write a ref while rendering.
  const loadOlderImplRef = useRef<() => void>(() => {})
  const loadOlder = useCallback(() => loadOlderImplRef.current(), [])

  // ── Scroll event processing (rAF-throttled) ───────────────────────────────
  // Reads layout (scrollHeight) which `content-visibility: auto` makes costly,
  // so it runs at most once per frame.
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
    loadOlderImplRef.current = () => {
      if (
        !hasPreviousPage ||
        isFetchingPreviousPage ||
        isLoadingOlderRef.current
      )
        return
      const el = scrollContainerRef.current
      isLoadingOlderRef.current = true
      prevGroupCountRef.current = groupCount
      prependAnchorRef.current = el ? captureTopGroupAnchor(el) : null
      fetchPreviousPage()
    }
    processScrollRef.current = () => {
      const el = scrollContainerRef.current
      if (!el) return
      const distanceFromBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight

      if (el.scrollTop < LOAD_OLDER_THRESHOLD && hasPreviousPage) {
        loadOlderImplRef.current()
      }

      // While our own programmatic scroll is animating, don't reinterpret it as
      // user input. Real user gestures cancel the guard via the input listeners.
      if (programmaticScrollRef.current) {
        saveScrollPosition(el.scrollTop)
        return
      }

      pinnedRef.current = distanceFromBottom <= PIN_BOTTOM_THRESHOLD
      setButtonVisible(distanceFromBottom >= SHOW_BUTTON_THRESHOLD)
      saveScrollPosition(el.scrollTop)
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
  // Any upward gesture immediately stops auto-following and cancels an in-flight
  // programmatic scroll, so streaming/auto-scroll never fights the user. These
  // listeners only fire for genuine user input — programmatic scrollTop changes
  // don't dispatch wheel/touch/key events.
  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return

    const interrupt = () => {
      clearProgrammatic()
      pinnedRef.current = false
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
  }, [clearProgrammatic])

  // Clear the programmatic guard once the browser reports the scroll settled.
  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const onScrollEnd = () => clearProgrammatic()
    el.addEventListener("scrollend", onScrollEnd)
    return () => el.removeEventListener("scrollend", onScrollEnd)
  }, [clearProgrammatic])

  // ── Imperative scrollers ──────────────────────────────────────────────────
  const scrollToBottom = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    pinnedRef.current = true
    setButtonVisible(false)
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    if (distanceFromBottom < 10) return
    armProgrammatic()
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
  }, [armProgrammatic, setButtonVisible])

  const pinToBottom = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    pinnedRef.current = true
    setButtonVisible(false)
    armProgrammatic()
    el.scrollTop = el.scrollHeight
  }, [armProgrammatic, setButtonVisible])

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

    clearProgrammatic()
    pinnedRef.current = true

    let savedMeta = queryClient.getQueryData<ScrollMeta>(
      chatKeys.scroll(sessionId)
    )
    if (!savedMeta?.visited) {
      const localMeta = syncEngine.getScrollMeta(sessionId)
      if (localMeta) savedMeta = localMeta
    }

    if (savedMeta?.visited) {
      el.scrollTop = savedMeta.scrollTop
      pinnedRef.current = savedMeta.isPinned
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

    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    setButtonVisible(distanceFromBottom >= SHOW_BUTTON_THRESHOLD)
  }, [
    threadId,
    sessionId,
    queryClient,
    syncEngine,
    groupCount,
    isLoadingMessages,
    clearProgrammatic,
    setButtonVisible,
  ])

  // ── Auto-follow new content while pinned ──────────────────────────────────
  // Coarse events (turn state changes, new groups). Instant snap — matches the
  // ResizeObserver below so the two never produce competing animations (the
  // source of scroll jitter), and reads as snappy.
  useLayoutEffect(() => {
    // A prepend also grows groupCount and fires this; the prepend-restore effect
    // below keeps the user's place, so never snap to bottom there.
    if (isLoadingOlderRef.current) return
    if (!pinnedRef.current || groupCount === 0) return
    const el = scrollContainerRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    if (distanceFromBottom < 5) return
    armProgrammatic()
    el.scrollTop = el.scrollHeight
  }, [isLoading, groupCount, armProgrammatic])

  // After older pages prepend, restore the pinned anchor group to the exact
  // viewport offset it held before loading, so the view stays put. Measuring the
  // real element (vs. a scrollHeight delta) stays correct even when
  // content-visibility size estimates for the newly prepended off-screen groups
  // differ from their eventual real heights.
  useLayoutEffect(() => {
    const prevCount = prevGroupCountRef.current
    if (isLoadingOlderRef.current && groupCount > prevCount) {
      isLoadingOlderRef.current = false
      const el = scrollContainerRef.current
      const anchor = prependAnchorRef.current
      prependAnchorRef.current = null
      if (el && anchor) {
        const node = findGroupByKey(el, anchor.key)
        if (node) {
          const delta = node.getBoundingClientRect().top - anchor.top
          if (delta !== 0) el.scrollTop += delta
        }
      }
    }
    prevGroupCountRef.current = groupCount
  }, [groupCount])

  // Keep the view glued to the bottom as content grows (word-reveal, streaming
  // text deltas). Instant snap only — incremental deltas are small enough to be
  // imperceptible, and stacking smooth scrolls causes jitter.
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
      armProgrammatic()
      el.scrollTop = el.scrollHeight
    })
    ro.observe(container)
    return () => ro.disconnect()
  }, [armProgrammatic])

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
    loadOlder,
  }
}
