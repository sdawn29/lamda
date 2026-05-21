import { useEffect, useState } from "react"

// Reveal cadence — base interval when caught up. Adaptive: if the reveal
// falls more than CATCHUP_THRESHOLD words behind the actual content, the
// interval shrinks so the cursor catches up without losing the typewriter
// feel. Once the gap closes, it returns to baseline.
const BASE_INTERVAL_MS = 35
const FAST_INTERVAL_MS = 12
const CATCHUP_THRESHOLD = 12

interface RevealData {
  /** Slice of content up to the n-th word boundary (or full content if n >= total). */
  sliced: string
  /** Word count of the full content. */
  total: number
}

function wordRevealData(content: string, n: number): RevealData {
  if (n <= 0) return { sliced: "", total: countWords(content) }

  let count = 0
  let inWord = false
  let slicedAt = -1
  for (let i = 0; i < content.length; i++) {
    const ch = content[i]
    const isSpace = ch === " " || ch === "\n" || ch === "\t" || ch === "\r"
    if (!isSpace && !inWord) {
      inWord = true
    } else if (isSpace && inWord) {
      inWord = false
      count++
      if (slicedAt < 0 && count >= n) slicedAt = i
    }
  }
  if (inWord) count++
  return {
    sliced: slicedAt >= 0 ? content.slice(0, slicedAt) : content,
    total: count,
  }
}

function countWords(content: string): number {
  let count = 0
  let inWord = false
  for (let i = 0; i < content.length; i++) {
    const ch = content[i]
    const isSpace = ch === " " || ch === "\n" || ch === "\t" || ch === "\r"
    if (!isSpace && !inWord) {
      inWord = true
    } else if (isSpace && inWord) {
      inWord = false
      count++
    }
  }
  if (inWord) count++
  return count
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
 * - The interval adapts to backlog: if there are many more words queued
 *   than revealed, words come faster so the reveal catches up to the
 *   actual content; otherwise it stays at the baseline cadence.
 */
export function useWordReveal(content: string, isNew: boolean): string {
  const [revealedWords, setRevealedWords] = useState(0)
  // Latches on the first render where isNew is true and stays on; the reveal
  // continues to completion even if isNew flips back to false mid-stream
  // (which happens when agent_end lands while words are still arriving).
  const [started, setStarted] = useState(isNew)
  if (isNew && !started) setStarted(true)

  const { sliced, total } = wordRevealData(content, revealedWords)

  useEffect(() => {
    if (!started || revealedWords >= total) return
    const backlog = total - revealedWords
    const interval = backlog > CATCHUP_THRESHOLD ? FAST_INTERVAL_MS : BASE_INTERVAL_MS
    const id = setTimeout(() => setRevealedWords((c) => c + 1), interval)
    return () => clearTimeout(id)
  }, [revealedWords, total, started])

  // Historical messages (never started) or fully revealed → show all text.
  if (!started || revealedWords >= total) return content
  return sliced
}
