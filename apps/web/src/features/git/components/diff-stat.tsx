import { memo, useEffect, useRef, useState } from "react"

export function parseDiffCounts(diff: string): {
  added: number
  removed: number
} {
  let added = 0
  let removed = 0
  for (const line of diff.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) added++
    else if (line.startsWith("-") && !line.startsWith("---")) removed++
  }
  return { added, removed }
}

const COUNT_ANIMATION_MS = 450

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

/**
 * Tween the displayed value toward `target` whenever it changes, ticking
 * through intermediate integers. Initializes at the target so a freshly
 * mounted stat (static file lists) renders instantly; only in-place changes
 * animate — e.g. the editing group's counts as streamed edits land. A change
 * mid-tween retargets from the current displayed value, and
 * prefers-reduced-motion snaps directly.
 */
function useAnimatedCount(target: number): number {
  const [display, setDisplay] = useState(target)
  const displayRef = useRef(target)
  const rafRef = useRef(0)

  useEffect(() => {
    const from = displayRef.current
    if (from === target) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      displayRef.current = target
      setDisplay(target)
      return
    }
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min((now - start) / COUNT_ANIMATION_MS, 1)
      const value = Math.round(from + (target - from) * easeOutCubic(t))
      displayRef.current = value
      setDisplay(value)
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target])

  return display
}

export const DiffStat = memo(function DiffStat({
  added,
  removed,
}: {
  added: number
  removed: number
}) {
  const displayAdded = useAnimatedCount(added)
  const displayRemoved = useAnimatedCount(removed)
  if (added === 0 && removed === 0) return null
  return (
    <span className="flex shrink-0 items-baseline gap-0.5 font-mono text-3xs tabular-nums">
      {added > 0 && <span className="text-diff-add">+{displayAdded}</span>}
      {removed > 0 && <span className="text-diff-remove">-{displayRemoved}</span>}
    </span>
  )
})
