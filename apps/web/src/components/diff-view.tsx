import { useMemo } from "react"
import { refractor } from "refractor"
import { cn } from "@/lib/utils"
import { jellybeansdark, jellybeanslight } from "@/lib/syntax-theme"
import { useTheme } from "@/components/theme-provider"

export type DiffMode = "inline" | "side-by-side"

type DiffLineKind = "added" | "removed" | "context" | "skipped"

interface DiffLine {
  kind: DiffLineKind
  lineNum: string
  content: string
}

// ── Syntax highlighting ────────────────────────────────────────────────────────

const EXT_TO_LANG: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  py: "python",
  rs: "rust",
  go: "go",
  css: "css",
  html: "html",
  json: "json",
  sh: "bash",
  bash: "bash",
  yaml: "yaml",
  yml: "yaml",
  md: "markdown",
  mdx: "markdown",
  sql: "sql",
  java: "java",
  c: "c",
  cpp: "cpp",
  cs: "csharp",
  rb: "ruby",
  php: "php",
  kt: "kotlin",
}

export function detectLanguage(filePath: string): string | null {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? ""
  const lang = EXT_TO_LANG[ext] ?? null
  if (lang && refractor.registered(lang)) return lang
  return null
}

type HastText = { type: "text"; value: string }
type HastElement = {
  type: "element"
  tagName: string
  properties: { className?: string[] }
  children: HastNode[]
}
type HastNode = HastText | HastElement

type FlatToken = { classNames: string[]; text: string }

function flattenHast(
  nodes: HastNode[],
  classNames: string[] = []
): FlatToken[] {
  const tokens: FlatToken[] = []
  for (const node of nodes) {
    if (node.type === "text") {
      tokens.push({ classNames, text: node.value })
    } else if (node.type === "element") {
      const cls = node.properties?.className ?? []
      tokens.push(
        ...flattenHast(node.children as HastNode[], [...classNames, ...cls])
      )
    }
  }
  return tokens
}

function splitTokensByLine(tokens: FlatToken[]): FlatToken[][] {
  const lines: FlatToken[][] = [[]]
  for (const token of tokens) {
    const parts = token.text.split("\n")
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) lines.push([])
      if (parts[i] !== "") {
        lines[lines.length - 1].push({
          classNames: token.classNames,
          text: parts[i],
        })
      }
    }
  }
  return lines
}

function highlightSource(source: string, language: string): FlatToken[][] {
  try {
    const root = refractor.highlight(source, language)
    const tokens = flattenHast(root.children as HastNode[])
    return splitTokensByLine(tokens)
  } catch {
    return source.split("\n").map((line) => [{ classNames: [], text: line }])
  }
}

type ThemeStyle = Record<string, React.CSSProperties>

function tokenStyle(
  classNames: string[],
  themeStyle: ThemeStyle
): React.CSSProperties {
  let result: React.CSSProperties = {}
  for (const cls of classNames) {
    if (cls === "token") continue
    if ((themeStyle as Record<string, React.CSSProperties>)[cls]) {
      result = {
        ...result,
        ...(themeStyle as Record<string, React.CSSProperties>)[cls],
      }
    }
  }
  return result
}

function renderTokens(
  tokens: FlatToken[],
  themeStyle: ThemeStyle
): React.ReactNode {
  if (tokens.length === 0) return " "
  return tokens.map((token, i) => {
    const style = tokenStyle(token.classNames, themeStyle)
    if (Object.keys(style).length === 0) return token.text
    return (
      <span key={i} style={style}>
        {token.text}
      </span>
    )
  })
}

interface HighlightMap {
  newLines: FlatToken[][]
  oldLines: FlatToken[][]
  newLineIndex: number[]
  oldLineIndex: number[]
}

function buildHighlightMap(
  lines: DiffLine[],
  language: string | null
): HighlightMap {
  const newFileLines: { diffIndex: number; content: string }[] = []
  const oldFileLines: { diffIndex: number; content: string }[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.kind !== "removed" && line.kind !== "skipped") {
      newFileLines.push({ diffIndex: i, content: line.content })
    }
    if (line.kind !== "added" && line.kind !== "skipped") {
      oldFileLines.push({ diffIndex: i, content: line.content })
    }
  }

  const newLineIndex = new Array<number>(lines.length).fill(-1)
  newFileLines.forEach((l, idx) => {
    newLineIndex[l.diffIndex] = idx
  })

  const oldLineIndex = new Array<number>(lines.length).fill(-1)
  oldFileLines.forEach((l, idx) => {
    oldLineIndex[l.diffIndex] = idx
  })

  if (!language) {
    const plain = (content: string): FlatToken[] => [
      { classNames: [], text: content },
    ]
    return {
      newLines: newFileLines.map((l) => plain(l.content)),
      oldLines: oldFileLines.map((l) => plain(l.content)),
      newLineIndex,
      oldLineIndex,
    }
  }

  const newHighlighted = highlightSource(
    newFileLines.map((l) => l.content).join("\n"),
    language
  )
  const oldHighlighted = highlightSource(
    oldFileLines.map((l) => l.content).join("\n"),
    language
  )

  return {
    newLines: newHighlighted,
    oldLines: oldHighlighted,
    newLineIndex,
    oldLineIndex,
  }
}

function getLineTokens(
  line: DiffLine,
  diffIndex: number,
  map: HighlightMap
): FlatToken[] {
  const fallback: FlatToken[] = [{ classNames: [], text: line.content }]
  if (line.kind === "removed") {
    const idx = map.oldLineIndex[diffIndex]
    return idx >= 0 && idx < map.oldLines.length
      ? (map.oldLines[idx] ?? fallback)
      : fallback
  }
  if (line.kind === "added" || line.kind === "context") {
    const idx = map.newLineIndex[diffIndex]
    return idx >= 0 && idx < map.newLines.length
      ? (map.newLines[idx] ?? fallback)
      : fallback
  }
  return fallback
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
        prefix === "+"
          ? "added"
          : prefix === "-"
            ? "removed"
            : isSkipped
              ? "skipped"
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
      result.push({
        kind: "added",
        lineNum: String(newLine++),
        content: raw.slice(1),
      })
    } else if (raw.startsWith("-")) {
      result.push({
        kind: "removed",
        lineNum: String(oldLine++),
        content: raw.slice(1),
      })
    } else if (raw.startsWith(" ") || raw === "") {
      result.push({
        kind: "context",
        lineNum: String(oldLine),
        content: raw.slice(1),
      })
      oldLine++
      newLine++
    }
  }

  return result
}

// ── Inline row ─────────────────────────────────────────────────────────────────

function DiffRow({
  line,
  diffIndex,
  map,
  themeStyle,
}: {
  line: DiffLine
  diffIndex: number
  map: HighlightMap
  themeStyle: ThemeStyle
}) {
  const tokens = getLineTokens(line, diffIndex, map)

  return (
    <div
      className={cn(
        "flex leading-5",
        line.kind === "added" && "bg-green-500/8 hover:bg-green-500/12",
        line.kind === "removed" && "bg-red-500/8 hover:bg-red-500/12"
      )}
    >
      <span
        className={cn(
          "w-4 shrink-0 text-center select-none",
          line.kind === "added" && "text-green-500",
          line.kind === "removed" && "text-red-500",
          (line.kind === "context" || line.kind === "skipped") &&
            "text-muted-foreground/30"
        )}
      >
        {line.kind === "added" ? "+" : line.kind === "removed" ? "−" : ""}
      </span>

      <span
        className={cn(
          "w-8 shrink-0 border-r pr-2 text-right select-none",
          line.kind === "added" && "border-green-500/20 text-green-400/50",
          line.kind === "removed" && "border-red-500/20 text-red-400/50",
          (line.kind === "context" || line.kind === "skipped") &&
            "border-border/40 text-muted-foreground/40"
        )}
      >
        {line.lineNum}
      </span>

      <span
        className={cn(
          "flex-1 pl-3 whitespace-pre",
          line.kind === "skipped" && "text-muted-foreground/40 italic"
        )}
      >
        {line.kind === "skipped" ? "⋯" : renderTokens(tokens, themeStyle)}
      </span>
    </div>
  )
}

// ── Side-by-side ───────────────────────────────────────────────────────────────

interface SideBySideRow {
  left: { line: DiffLine; diffIndex: number } | null
  right: { line: DiffLine; diffIndex: number } | null
}

function buildSideBySideRows(lines: DiffLine[]): SideBySideRow[] {
  const rows: SideBySideRow[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.kind === "context" || line.kind === "skipped") {
      rows.push({ left: { line, diffIndex: i }, right: { line, diffIndex: i } })
      i++
      continue
    }

    const removed: { line: DiffLine; diffIndex: number }[] = []
    const added: { line: DiffLine; diffIndex: number }[] = []

    while (i < lines.length && lines[i].kind === "removed") {
      removed.push({ line: lines[i], diffIndex: i })
      i++
    }
    while (i < lines.length && lines[i].kind === "added") {
      added.push({ line: lines[i], diffIndex: i })
      i++
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
  entry,
  map,
  themeStyle,
}: {
  entry: { line: DiffLine; diffIndex: number } | null
  map: HighlightMap
  themeStyle: ThemeStyle
}) {
  if (!entry) {
    return <div className="flex min-w-0 flex-1 leading-5" />
  }

  const { line, diffIndex } = entry
  const isSkipped = line.kind === "skipped"
  const isAdded = line.kind === "added"
  const isRemoved = line.kind === "removed"
  const tokens = getLineTokens(line, diffIndex, map)

  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 leading-5",
        isAdded && "bg-green-500/8",
        isRemoved && "bg-red-500/8"
      )}
    >
      <span
        className={cn(
          "w-8 shrink-0 border-r pr-2 text-right text-xs select-none",
          isAdded && "border-green-500/20 text-green-400/50",
          isRemoved && "border-red-500/20 text-red-400/50",
          (line.kind === "context" || isSkipped) &&
            "border-border/40 text-muted-foreground/40"
        )}
      >
        {isSkipped ? "" : line.lineNum}
      </span>
      <span
        className={cn(
          "flex-1 truncate pl-2 whitespace-pre",
          isSkipped && "text-muted-foreground/40 italic"
        )}
      >
        {isSkipped ? "⋯" : renderTokens(tokens, themeStyle)}
      </span>
    </div>
  )
}

function SideBySideRowView({
  row,
  map,
  themeStyle,
}: {
  row: SideBySideRow
  map: HighlightMap
  themeStyle: ThemeStyle
}) {
  return (
    <div className="flex divide-x divide-border/30 leading-5">
      <SideBySideCell entry={row.left} map={map} themeStyle={themeStyle} />
      <SideBySideCell entry={row.right} map={map} themeStyle={themeStyle} />
    </div>
  )
}

// ── Public component ───────────────────────────────────────────────────────────

interface DiffViewProps {
  diff: string
  filePath?: string
  className?: string
  mode?: DiffMode
}

export function DiffView({
  diff,
  filePath,
  className,
  mode = "inline",
}: DiffViewProps) {
  const { theme } = useTheme()
  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches)
  const themeStyle = (isDark ? jellybeansdark : jellybeanslight) as ThemeStyle

  const lines = useMemo(() => {
    return isSdkFormat(diff) ? parseSdkDiff(diff) : parseUnifiedDiff(diff)
  }, [diff])

  const language = useMemo(
    () => (filePath ? detectLanguage(filePath) : null),
    [filePath]
  )

  const highlightMap = useMemo(
    () => buildHighlightMap(lines, language),
    [lines, language]
  )

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
        className
      )}
    >
      <div className="max-h-80 overflow-auto">
        {mode === "inline"
          ? lines.map((line, i) => (
              <DiffRow
                key={i}
                line={line}
                diffIndex={i}
                map={highlightMap}
                themeStyle={themeStyle}
              />
            ))
          : sideBySideRows?.map((row, i) => (
              <SideBySideRowView
                key={i}
                row={row}
                map={highlightMap}
                themeStyle={themeStyle}
              />
            ))}
      </div>

      {(added > 0 || removed > 0) && (
        <div className="flex items-center gap-3 border-t border-border/60 bg-muted/20 px-3 py-1.5 font-sans text-xs text-muted-foreground">
          {removed > 0 && (
            <span className="text-red-500">−{removed} removed</span>
          )}
          {added > 0 && (
            <span className="text-green-600 dark:text-green-400">
              +{added} added
            </span>
          )}
        </div>
      )}
    </div>
  )
}
