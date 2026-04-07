import { useMemo } from "react"
import { cn } from "@/lib/utils"

export type DiffMode = "inline" | "side-by-side"

type DiffLineKind = "added" | "removed" | "context" | "skipped"

interface DiffLine {
  kind: DiffLineKind
  lineNum: string
  content: string
}

// ── Format detection ───────────────────────────────────────────────────────────

function isSdkFormat(diff: string): boolean {
  const first = diff.split("\n").find(Boolean) ?? ""
  return /^[+\- ]\d+ /.test(first)
}

// ── SDK format parser ──────────────────────────────────────────────────────────

function parseSdkDiff(diff: string): DiffLine[] {
  return diff
    .split("\n")
    .filter(Boolean)
    .map((raw): DiffLine => {
      const prefix = raw[0]
      const rest = raw.slice(1)
      const spaceIdx = rest.indexOf(" ")
      const lineNum = spaceIdx === -1 ? rest : rest.slice(0, spaceIdx)
      const content = spaceIdx === -1 ? "" : rest.slice(spaceIdx + 1)
      const isSkipped = prefix === " " && content === "..."
      const kind: DiffLineKind =
        prefix === "+" ? "added"
        : prefix === "-" ? "removed"
        : isSkipped ? "skipped"
        : "context"
      return { kind, lineNum, content }
    })
}

// ── Unified diff parser ────────────────────────────────────────────────────────

function parseUnifiedDiff(diff: string): DiffLine[] {
  const result: DiffLine[] = []
  let oldLine = 0
  let newLine = 0

  for (const raw of diff.split("\n")) {
    if (
      raw.startsWith("diff ") ||
      raw.startsWith("index ") ||
      raw.startsWith("--- ") ||
      raw.startsWith("+++ ")
    ) {
      continue
    }

    if (raw.startsWith("@@")) {
      const m = raw.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      if (m) {
        oldLine = parseInt(m[1], 10)
        newLine = parseInt(m[2], 10)
      }
      result.push({ kind: "skipped", lineNum: "", content: "" })
      continue
    }

    if (raw.startsWith("+")) {
      result.push({ kind: "added", lineNum: String(newLine++), content: raw.slice(1) })
    } else if (raw.startsWith("-")) {
      result.push({ kind: "removed", lineNum: String(oldLine++), content: raw.slice(1) })
    } else if (raw.startsWith(" ") || raw === "") {
      result.push({ kind: "context", lineNum: String(oldLine), content: raw.slice(1) })
      oldLine++
      newLine++
    }
  }

  return result
}

// ── Inline row ─────────────────────────────────────────────────────────────────

function DiffRow({ line }: { line: DiffLine }) {
  return (
    <div
      className={cn(
        "flex leading-5",
        line.kind === "added" && "bg-green-500/8 hover:bg-green-500/12",
        line.kind === "removed" && "bg-red-500/8 hover:bg-red-500/12",
      )}
    >
      <span
        className={cn(
          "w-4 shrink-0 select-none text-center",
          line.kind === "added" && "text-green-500",
          line.kind === "removed" && "text-red-500",
          (line.kind === "context" || line.kind === "skipped") && "text-muted-foreground/30",
        )}
      >
        {line.kind === "added" ? "+" : line.kind === "removed" ? "−" : ""}
      </span>

      <span
        className={cn(
          "w-8 shrink-0 select-none border-r pr-2 text-right",
          line.kind === "added" && "border-green-500/20 text-green-400/50",
          line.kind === "removed" && "border-red-500/20 text-red-400/50",
          (line.kind === "context" || line.kind === "skipped") &&
            "border-border/40 text-muted-foreground/40",
        )}
      >
        {line.lineNum}
      </span>

      <span
        className={cn(
          "flex-1 whitespace-pre pl-3",
          line.kind === "added" && "text-green-700 dark:text-green-400",
          line.kind === "removed" && "text-red-700 dark:text-red-400",
          line.kind === "context" && "text-foreground/60",
          line.kind === "skipped" && "italic text-muted-foreground/40",
        )}
      >
        {line.kind === "skipped" ? "⋯" : line.content || " "}
      </span>
    </div>
  )
}

// ── Side-by-side ───────────────────────────────────────────────────────────────

interface SideBySideRow {
  left: DiffLine | null
  right: DiffLine | null
}

function buildSideBySideRows(lines: DiffLine[]): SideBySideRow[] {
  const rows: SideBySideRow[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.kind === "context" || line.kind === "skipped") {
      rows.push({ left: line, right: line })
      i++
      continue
    }

    // Collect a run of removed then added lines
    const removed: DiffLine[] = []
    const added: DiffLine[] = []

    while (i < lines.length && lines[i].kind === "removed") {
      removed.push(lines[i++])
    }
    while (i < lines.length && lines[i].kind === "added") {
      added.push(lines[i++])
    }

    const maxLen = Math.max(removed.length, added.length)
    for (let j = 0; j < maxLen; j++) {
      rows.push({
        left: removed[j] ?? null,
        right: added[j] ?? null,
      })
    }
  }

  return rows
}

function SideBySideCell({
  line,
  side,
}: {
  line: DiffLine | null
  side: "left" | "right"
}) {
  if (!line) {
    return <div className="flex flex-1 leading-5 min-w-0" />
  }

  const isSkipped = line.kind === "skipped"
  const isAdded = line.kind === "added"
  const isRemoved = line.kind === "removed"

  return (
    <div
      className={cn(
        "flex flex-1 leading-5 min-w-0",
        isAdded && "bg-green-500/8",
        isRemoved && "bg-red-500/8",
      )}
    >
      <span
        className={cn(
          "w-8 shrink-0 select-none border-r pr-2 text-right text-xs",
          isAdded && "border-green-500/20 text-green-400/50",
          isRemoved && "border-red-500/20 text-red-400/50",
          (line.kind === "context" || isSkipped) && "border-border/40 text-muted-foreground/40",
        )}
      >
        {isSkipped ? "" : line.lineNum}
      </span>
      <span
        className={cn(
          "flex-1 whitespace-pre pl-2 truncate",
          isAdded && "text-green-700 dark:text-green-400",
          isRemoved && "text-red-700 dark:text-red-400",
          line.kind === "context" && "text-foreground/60",
          isSkipped && "italic text-muted-foreground/40",
        )}
      >
        {isSkipped ? "⋯" : line.content || " "}
      </span>
    </div>
  )
}

function SideBySideRow({ row }: { row: SideBySideRow }) {
  return (
    <div className="flex leading-5 divide-x divide-border/30">
      <SideBySideCell line={row.left} side="left" />
      <SideBySideCell line={row.right} side="right" />
    </div>
  )
}

// ── Public component ───────────────────────────────────────────────────────────

interface DiffViewProps {
  diff: string
  className?: string
  mode?: DiffMode
}

export function DiffView({ diff, className, mode = "inline" }: DiffViewProps) {
  const lines = useMemo(() => {
    return isSdkFormat(diff) ? parseSdkDiff(diff) : parseUnifiedDiff(diff)
  }, [diff])

  const sideBySideRows = useMemo(() => {
    if (mode !== "side-by-side") return null
    return buildSideBySideRows(lines)
  }, [lines, mode])

  const added = lines.filter((l) => l.kind === "added").length
  const removed = lines.filter((l) => l.kind === "removed").length

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border/60 font-mono text-xs",
        className,
      )}
    >
      <div className="max-h-80 overflow-auto">
        {mode === "inline"
          ? lines.map((line, i) => <DiffRow key={i} line={line} />)
          : sideBySideRows?.map((row, i) => <SideBySideRow key={i} row={row} />)}
      </div>

      {(added > 0 || removed > 0) && (
        <div className="flex items-center gap-3 border-t border-border/60 bg-muted/20 px-3 py-1.5 font-sans text-xs text-muted-foreground">
          {removed > 0 && <span className="text-red-500">−{removed} removed</span>}
          {added > 0 && <span className="text-green-600 dark:text-green-400">+{added} added</span>}
        </div>
      )}
    </div>
  )
}
