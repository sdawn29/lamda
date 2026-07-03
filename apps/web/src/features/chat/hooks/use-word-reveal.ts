import { useEffect, useMemo, useState } from "react"

// Reveal cadence — base interval when caught up. Adaptive: as the reveal
// falls behind the actual content, the interval and step size ramp up
// smoothly (linear interpolation, not a threshold snap) so speeding up to
// catch up and easing back to baseline both read as one continuous
// acceleration rather than a visible gear-change.
const BASE_INTERVAL_MS = 35
const FAST_INTERVAL_MS = 12
// Backlog range over which the ramp is interpolated: below RAMP_START the
// reveal sits at baseline; at/above RAMP_END it's at full catch-up speed.
const RAMP_START = 4
const RAMP_END = 40
// Upper bound on words revealed per tick. Each tick re-renders the markdown
// tree, so a deep backlog is drained by widening the step (bounded number of
// renders) instead of queueing thousands of single-word timeouts — a long
// turn used to need tens of seconds to finish revealing after agent_end.
const MAX_WORDS_PER_TICK = 8
// Micro-pause multipliers that give the reveal a natural typing rhythm: a
// beat after a sentence ends, a slightly longer one at a paragraph break.
// Only applied while the reveal is caught up (low ramp) — a backlog drain
// must never be slowed down by punctuation.
const SENTENCE_PAUSE_FACTOR = 2.2
const PARAGRAPH_PAUSE_FACTOR = 3
const PAUSE_RAMP_CUTOFF = 0.35

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

export interface WordRevealResult {
  /** The portion of `content` currently visible. */
  text: string
  /** True while the typewriter is still catching up to the full content. */
  isRevealing: boolean
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
 *   up to the actual content; otherwise it stays at the baseline cadence,
 *   with micro-pauses after sentence ends and paragraph breaks so the
 *   typewriter reads with a natural rhythm instead of a metronome tick.
 * - Respects prefers-reduced-motion by skipping the reveal entirely,
 *   matching the CSS entry animations which are also disabled there.
 */
export function useWordReveal(
  content: string,
  isNew: boolean
): WordRevealResult {
  // Start at 1 for new messages so the first word is visible immediately;
  // starting at 0 causes a 35 ms blank while the entry animation is already
  // fading in, which is noticeable even at a low opacity.
  const [revealedWords, setRevealedWords] = useState(() => (isNew ? 1 : 0))
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
    if (!animate || !scan || revealedWords >= total) return
    const backlog = total - revealedWords
    const ramp = Math.min(
      1,
      Math.max(0, (backlog - RAMP_START) / (RAMP_END - RAMP_START))
    )
    let interval =
      BASE_INTERVAL_MS - ramp * (BASE_INTERVAL_MS - FAST_INTERVAL_MS)
    // Natural typing rhythm: pause briefly where the visible text ends on
    // sentence punctuation or a paragraph break — but only while roughly
    // caught up, so draining a backlog is never slowed down.
    if (ramp < PAUSE_RAMP_CUTOFF && revealedWords <= scan.boundaries.length) {
      const boundary = scan.boundaries[revealedWords - 1]
      if (boundary !== undefined) {
        const lastChar = content[boundary - 1]
        if (boundary + 1 < content.length && content[boundary] === "\n") {
          interval *= PARAGRAPH_PAUSE_FACTOR
        } else if (
          lastChar === "." ||
          lastChar === "!" ||
          lastChar === "?" ||
          lastChar === ":"
        ) {
          interval *= SENTENCE_PAUSE_FACTOR
        }
      }
    }
    const step = 1 + Math.round(ramp * (MAX_WORDS_PER_TICK - 1))
    const id = setTimeout(() => setRevealedWords((c) => c + step), interval)
    return () => clearTimeout(id)
  }, [revealedWords, total, animate, scan, content])

  // Historical messages (never started), reduced motion, or fully revealed →
  // show all text.
  if (!scan || revealedWords >= total)
    return { text: content, isRevealing: false }
  if (revealedWords > scan.boundaries.length)
    return { text: content, isRevealing: true }
  return {
    text: content.slice(0, scan.boundaries[revealedWords - 1]),
    isRevealing: true,
  }
}
