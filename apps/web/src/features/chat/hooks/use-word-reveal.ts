import { useEffect, useMemo, useState } from "react"

// Reveal cadence — base interval when caught up. Adaptive: if the reveal
// falls more than CATCHUP_THRESHOLD words behind the actual content, the
// interval shrinks and multiple words are revealed per tick so the cursor
// catches up without losing the typewriter feel. Once the gap closes, it
// returns to baseline.
const BASE_INTERVAL_MS = 35
const FAST_INTERVAL_MS = 12
const CATCHUP_THRESHOLD = 12
// Upper bound on words revealed per tick. Each tick re-renders the markdown
// tree, so a deep backlog is drained by widening the step (bounded number of
// renders) instead of queueing thousands of single-word timeouts — a long
// turn used to need tens of seconds to finish revealing after agent_end.
const MAX_WORDS_PER_TICK = 8

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

interface WordScan {
  /** Char index of the whitespace that ended each completed word. */
  boundaries: number[]
  /** Word count, including a trailing word with no whitespace after it. */
  total: number
}

function isSpace(ch: string): boolean {
  return ch === " " || ch === "\n" || ch === "\t" || ch === "\r"
}

function scanWords(content: string): WordScan {
  const boundaries: number[] = []
  let inWord = false
  for (let i = 0; i < content.length; i++) {
    const space = isSpace(content[i])
    if (!space && !inWord) {
      inWord = true
    } else if (space && inWord) {
      inWord = false
      boundaries.push(i)
    }
  }
  return { boundaries, total: boundaries.length + (inWord ? 1 : 0) }
}

/**
 * Progressively reveal `content` word-by-word.
 *
 * - `isNew` gates whether the reveal animation runs at all. For historical
 *   messages it stays false and the full content is shown immediately.
 * - For a new message, the reveal starts when isNew is true. If `isNew`
 *   flips back to false mid-reveal (e.g. the agent_end event lands while
 *   words are still being revealed), the reveal keeps running so the user
 *   sees a continuous typewriter rather than a content snap.
 * - The cadence adapts to backlog: if there are many more words queued than
 *   revealed, words come faster and in small batches so the reveal catches
 *   up to the actual content; otherwise it stays at the baseline cadence.
 * - Respects prefers-reduced-motion by skipping the reveal entirely,
 *   matching the CSS entry animations which are also disabled there.
 */
export function useWordReveal(content: string, isNew: boolean): string {
  const [revealedWords, setRevealedWords] = useState(0)
  // Latches on the first render where isNew is true and stays on; the reveal
  // continues to completion even if isNew flips back to false mid-stream
  // (which happens when agent_end lands while words are still arriving).
  const [started, setStarted] = useState(isNew)
  if (isNew && !started) setStarted(true)

  const animate = started && !prefersReducedMotion()

  // Word boundaries are scanned once per content change, not on every reveal
  // tick — per tick only an O(1) boundary lookup + slice remains. (The old
  // implementation re-scanned the full string on each tick: O(words × length)
  // over a long reply, enough to visibly stutter the typewriter.)
  const scan = useMemo(
    () => (animate ? scanWords(content) : null),
    [animate, content]
  )
  const total = scan?.total ?? 0

  useEffect(() => {
    if (!animate || revealedWords >= total) return
    const backlog = total - revealedWords
    const catchingUp = backlog > CATCHUP_THRESHOLD
    const interval = catchingUp ? FAST_INTERVAL_MS : BASE_INTERVAL_MS
    const step = catchingUp
      ? Math.min(MAX_WORDS_PER_TICK, Math.ceil(backlog / CATCHUP_THRESHOLD))
      : 1
    const id = setTimeout(() => setRevealedWords((c) => c + step), interval)
    return () => clearTimeout(id)
  }, [revealedWords, total, animate])

  // Historical messages (never started), reduced motion, or fully revealed →
  // show all text.
  if (!scan || revealedWords >= total) return content
  if (revealedWords <= 0) return ""
  if (revealedWords > scan.boundaries.length) return content
  return content.slice(0, scan.boundaries[revealedWords - 1])
}
