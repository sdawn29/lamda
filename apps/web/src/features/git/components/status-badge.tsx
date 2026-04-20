import { memo } from "react"
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
    <span
      className={cn(
        "inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded px-0.5 font-mono text-[10px] leading-none font-semibold",
        meta.bg,
        meta.text
      )}
    >
      {label}
    </span>
  )
})