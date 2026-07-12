import { memo } from "react"
import { Badge } from "@/shared/ui/badge"
import { cn } from "@/shared/lib/utils"

export interface ChangedFile {
  raw: string
  filePath: string
  isStaged: boolean
  isUntracked: boolean
}

export function parseStatusLine(line: string): ChangedFile {
  const raw = line.slice(0, 2)
  const filePath = line.slice(3)
  const X = raw[0] ?? " "
  const isUntracked = raw.trim() === "??"
  const isStaged = !isUntracked && X !== " "
  return { raw, filePath, isStaged, isUntracked }
}

/** Parse raw `git status --porcelain` output into one entry per changed file. */
export function parseStatusLines(raw: string): ChangedFile[] {
  return raw
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map(parseStatusLine)
}

export function statusLabel(file: ChangedFile): string {
  if (file.isUntracked) return "U"
  const X = file.raw[0] ?? " "
  const Y = file.raw[1] ?? " "
  if (X !== " " && Y !== " ") return "M*"
  if (X !== " ") return X
  return Y
}

const STATUS_META: Record<string, { bg: string; text: string }> = {
  M: {
    bg: "bg-yellow-500/15 dark:bg-yellow-400/10",
    text: "text-yellow-600 dark:text-yellow-400",
  },
  "M*": {
    bg: "bg-yellow-500/15 dark:bg-yellow-400/10",
    text: "text-yellow-600 dark:text-yellow-400",
  },
  A: {
    bg: "bg-green-500/15 dark:bg-green-400/10",
    text: "text-green-600 dark:text-green-400",
  },
  D: {
    bg: "bg-red-500/15 dark:bg-red-400/10",
    text: "text-red-600 dark:text-red-400",
  },
  U: {
    bg: "bg-blue-500/15 dark:bg-blue-400/10",
    text: "text-blue-600 dark:text-blue-400",
  },
  R: {
    bg: "bg-purple-500/15 dark:bg-purple-400/10",
    text: "text-purple-600 dark:text-purple-400",
  },
}

/** Text-colour class for a status label — shared with the file tree. */
export function statusTextClass(label: string): string {
  return (STATUS_META[label] ?? { text: "text-muted-foreground" }).text
}

// Solid-fill dot classes per status label. Same color families as STATUS_META
// above — kept as literal strings (not derived via string replace) so
// Tailwind's scanner sees them.
const STATUS_DOT_CLASSES: Record<string, string> = {
  M: "bg-yellow-600 dark:bg-yellow-400",
  "M*": "bg-yellow-600 dark:bg-yellow-400",
  A: "bg-green-600 dark:bg-green-400",
  D: "bg-red-600 dark:bg-red-400",
  U: "bg-blue-600 dark:bg-blue-400",
  R: "bg-purple-600 dark:bg-purple-400",
}

/** Solid-fill dot class for a status label — used where a letter would be too
 *  loud (e.g. the composer's file-mention dropdown). */
export function statusDotClass(label: string): string {
  return STATUS_DOT_CLASSES[label] ?? "bg-muted-foreground"
}

/** Combined bg+text classes for a status label — used by pill badges outside
 *  this component (e.g. the file chip hover card in chat). */
export function statusBadgeClasses(label: string): string {
  const meta = STATUS_META[label] ?? {
    bg: "bg-muted",
    text: "text-muted-foreground",
  }
  return `${meta.bg} ${meta.text}`
}

export const StatusBadge = memo(function StatusBadge({
  file,
}: {
  file: ChangedFile
}) {
  const label = statusLabel(file)
  const meta = STATUS_META[label] ?? {
    bg: "bg-muted",
    text: "text-muted-foreground",
  }
  return (
    <Badge
      className={cn(
        "h-4 min-w-4 rounded-sm px-0.5 font-mono text-3xs leading-none font-semibold",
        meta.bg,
        meta.text
      )}
    >
      {label}
    </Badge>
  )
})
