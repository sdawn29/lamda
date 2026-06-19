import type { ReactNode } from "react"
import { cn } from "@/shared/lib/utils"
import { renderWithWordDiff } from "./word-diff"
import { refractor } from "refractor/core"
import bash from "refractor/bash"
import c from "refractor/c"
import cpp from "refractor/cpp"
import csharp from "refractor/csharp"
import css from "refractor/css"
import go from "refractor/go"
import html from "refractor/markup"
import java from "refractor/java"
import javascript from "refractor/javascript"
import json from "refractor/json"
import kotlin from "refractor/kotlin"
import markdown from "refractor/markdown"
import php from "refractor/php"
import python from "refractor/python"
import ruby from "refractor/ruby"
import rust from "refractor/rust"
import sql from "refractor/sql"
import jsx from "refractor/jsx"
import tsx from "refractor/tsx"
import typescript from "refractor/typescript"
import yaml from "refractor/yaml"
import type {
  CharRange,
  DiffLine,
  FlatToken,
  HastNode,
  HighlightMap,
  ThemeStyle,
} from "./types"
;[
  bash,
  c,
  cpp,
  csharp,
  css,
  go,
  html,
  java,
  javascript,
  json,
  jsx,
  kotlin,
  markdown,
  php,
  python,
  ruby,
  rust,
  sql,
  tsx,
  typescript,
  yaml,
].forEach((language) => {
  refractor.register(language)
})

const EXT_TO_LANG: Record<string, string> = {
  // TypeScript
  ts: "typescript",
  tsx: "tsx",
  mts: "typescript",
  cts: "typescript",
  // JavaScript
  js: "javascript",
  jsx: "jsx",
  mjs: "javascript",
  cjs: "javascript",
  mjsx: "jsx",
  cjsx: "jsx",
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

export function renderTokens(
  tokens: FlatToken[],
  themeStyle: ThemeStyle
): ReactNode {
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

/**
 * Renders the content cell of a diff line — either the "skipped" ellipsis,
 * word-diff highlighted segments, or syntax-highlighted tokens. Shared by the
 * inline (DiffRow) and side-by-side renderers.
 */
export function DiffLineContent({
  line,
  tokens,
  themeStyle,
  wordDiffRanges,
  isAdded,
  paddingClass = "pl-3",
}: {
  line: DiffLine
  tokens: FlatToken[]
  themeStyle: ThemeStyle
  wordDiffRanges?: CharRange[]
  isAdded: boolean
  paddingClass?: string
}): ReactNode {
  const isSkipped = line.kind === "skipped"
  return (
    <span
      className={cn(
        "w-max shrink-0 whitespace-pre",
        paddingClass,
        isSkipped &&
          "font-mono text-3xs italic text-muted-foreground/40"
      )}
    >
      {isSkipped ? (
        "⋯"
      ) : wordDiffRanges && wordDiffRanges.length > 0 ? (
        renderWithWordDiff(line.content, wordDiffRanges).map((part, i) =>
          part.highlighted ? (
            <span
              key={i}
              className={cn(
                "rounded-sm",
                isAdded ? "bg-diff-add/45" : "bg-diff-remove/45"
              )}
            >
              {part.text}
            </span>
          ) : (
            <span key={i}>{part.text}</span>
          )
        )
      ) : (
        renderTokens(tokens, themeStyle)
      )}
    </span>
  )
}

export function buildHighlightMap(
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
    return {
      newLines: [],
      oldLines: [],
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

export function getLineTokens(
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
