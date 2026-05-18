import { useState, useEffect, useMemo } from "react"

const WORD_REVEAL_INTERVAL_MS = 40

function wordRevealData(content: string, n: number): { sliced: string; total: number } {
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
    sliced: n <= 0 ? "" : slicedAt >= 0 ? content.slice(0, slicedAt) : content,
    total: count,
  }
}

export function useWordReveal(content: string, isNew: boolean): string {
  const [revealedWords, setRevealedWords] = useState(0)
  const { sliced, total } = useMemo(
    () => wordRevealData(content, revealedWords),
    [content, revealedWords]
  )

  useEffect(() => {
    if (!isNew || revealedWords >= total) return
    const id = setTimeout(() => setRevealedWords((c) => c + 1), WORD_REVEAL_INTERVAL_MS)
    return () => clearTimeout(id)
  }, [isNew, revealedWords, total])

  return isNew && revealedWords < total ? sliced : content
}
