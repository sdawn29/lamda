import { diff_match_patch, DIFF_DELETE, DIFF_INSERT } from "diff-match-patch"
import type { DiffLine, CharRange, WordDiffMap } from "./types"

function computeCharDiff(
  oldText: string,
  newText: string,
): { oldRanges: CharRange[]; newRanges: CharRange[] } {
  const dmp = new diff_match_patch()
  const diffs = dmp.diff_main(oldText, newText)
  dmp.diff_cleanupSemantic(diffs)

  const oldRanges: CharRange[] = []
  const newRanges: CharRange[] = []
  let oldPos = 0
  let newPos = 0

  for (const [op, text] of diffs) {
    if (op === DIFF_DELETE) {
      oldRanges.push({ start: oldPos, end: oldPos + text.length })
      oldPos += text.length
    } else if (op === DIFF_INSERT) {
      newRanges.push({ start: newPos, end: newPos + text.length })
      newPos += text.length
    } else {
      // DIFF_EQUAL
      oldPos += text.length
      newPos += text.length
    }
  }

  return { oldRanges, newRanges }
}

export function buildWordDiffMap(lines: DiffLine[]): WordDiffMap {
  const removed = new Map<number, CharRange[]>()
  const added = new Map<number, CharRange[]>()

  // Collect runs of removed/added lines within each hunk and pair them
  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    // Skip non-change lines
    if (line.kind !== "removed" && line.kind !== "added") {
      i++
      continue
    }

    // Collect a contiguous block of removed then added lines
    const removedLines: Array<{ index: number; content: string }> = []
    const addedLines: Array<{ index: number; content: string }> = []

    let j = i
    // Collect all removed lines first
    while (j < lines.length && lines[j].kind === "removed") {
      removedLines.push({ index: j, content: lines[j].content })
      j++
    }
    // Then all added lines immediately following
    while (j < lines.length && lines[j].kind === "added") {
      addedLines.push({ index: j, content: lines[j].content })
      j++
    }

    // Pair removed↔added in order (shortest list determines pair count)
    const pairCount = Math.min(removedLines.length, addedLines.length)
    for (let k = 0; k < pairCount; k++) {
      const rem = removedLines[k]
      const add = addedLines[k]
      if (!rem || !add) continue

      const { oldRanges, newRanges } = computeCharDiff(rem.content, add.content)

      // Only store if there are actual changes (avoids marking full lines when
      // lines are completely different — in that case, full-line colour is clearer)
      const totalChanged = oldRanges.reduce((s, r) => s + r.end - r.start, 0)
      const coverageRatio = rem.content.length > 0 ? totalChanged / rem.content.length : 1
      if (coverageRatio < 0.8) {
        if (oldRanges.length > 0) removed.set(rem.index, oldRanges)
        if (newRanges.length > 0) added.set(add.index, newRanges)
      }
    }

    i = j
  }

  return { removed, added }
}

export function renderWithWordDiff(
  text: string,
  ranges: CharRange[],
): Array<{ text: string; highlighted: boolean }> {
  if (ranges.length === 0) return [{ text, highlighted: false }]

  const parts: Array<{ text: string; highlighted: boolean }> = []
  let pos = 0

  for (const range of ranges) {
    if (pos < range.start) {
      parts.push({ text: text.slice(pos, range.start), highlighted: false })
    }
    parts.push({ text: text.slice(range.start, range.end), highlighted: true })
    pos = range.end
  }

  if (pos < text.length) {
    parts.push({ text: text.slice(pos), highlighted: false })
  }

  return parts
}
