import { memo } from "react"

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

export const DiffStat = memo(function DiffStat({
  added,
  removed,
}: {
  added: number
  removed: number
}) {
  if (added === 0 && removed === 0) return null
  return (
    <span className="flex shrink-0 items-baseline gap-0.5 font-mono text-[10px]">
      {added > 0 && (
        <span className="text-green-600 dark:text-green-400">+{added}</span>
      )}
      {removed > 0 && (
        <span className="text-red-500 dark:text-red-400">-{removed}</span>
      )}
    </span>
  )
})