import { useMemo, useState } from "react"
import { Icon } from "@iconify/react"

import { cn } from "@/shared/lib/utils"
import { getIconName } from "@/shared/ui/file-icon"
import { openFileTab } from "@/features/dock"
import {
  statusBadgeClasses,
  statusLabel,
} from "@/features/git/components/status-badge"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/shared/ui/tooltip"
import { useFileChipGitStatus, useFileChipRootPath } from "../file-chip-context"
import { useFilePeek } from "../queries"

/**
 * The one file chip used everywhere in a transcript — assistant markdown
 * references (`path:line`) and user @-mentions. Inline it renders as a plain
 * inline-code run (workspace-relative path + location) that wraps like normal
 * text; hovering opens a card with the full path, git state, file stats, and
 * a line-numbered peek centered on the referenced line. Clicking opens the
 * file in the review panel and scrolls to that line.
 */

/** Human-readable git status names for the hover-card pill. The staged+unstaged
 *  distinction (`M*`) is deliberately collapsed — it's noise at chip altitude. */
const STATUS_NAMES: Record<string, string> = {
  M: "Modified",
  "M*": "Modified",
  A: "Added",
  D: "Deleted",
  U: "Untracked",
  R: "Renamed",
}

/** Display names for the stats row, keyed by lowercase extension. Unknown
 *  extensions fall back to the extension itself, uppercased. */
const LANGUAGE_NAMES: Record<string, string> = {
  ts: "TypeScript",
  tsx: "TSX",
  js: "JavaScript",
  jsx: "JSX",
  mjs: "JavaScript",
  cjs: "JavaScript",
  json: "JSON",
  md: "Markdown",
  mdx: "MDX",
  css: "CSS",
  scss: "SCSS",
  less: "Less",
  html: "HTML",
  htm: "HTML",
  py: "Python",
  go: "Go",
  rs: "Rust",
  rb: "Ruby",
  java: "Java",
  kt: "Kotlin",
  swift: "Swift",
  c: "C",
  h: "C header",
  cpp: "C++",
  hpp: "C++ header",
  cs: "C#",
  php: "PHP",
  sh: "Shell",
  bash: "Shell",
  zsh: "Shell",
  sql: "SQL",
  yml: "YAML",
  yaml: "YAML",
  toml: "TOML",
  ini: "INI",
  env: "Dotenv",
  lock: "Lockfile",
  svg: "SVG",
  vue: "Vue",
  astro: "Astro",
  txt: "Plain text",
}

function languageName(basename: string): string | null {
  const lower = basename.toLowerCase()
  const dot = lower.lastIndexOf(".")
  if (dot <= 0 && !lower.startsWith(".")) return null
  const ext = lower.slice(lower.lastIndexOf(".") + 1)
  if (!ext) return null
  return LANGUAGE_NAMES[ext] ?? ext.toUpperCase()
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function resolveAbsolutePath(path: string, rootPath?: string): string {
  if (path.startsWith("/")) return path
  if (rootPath) return `${rootPath.replace(/\/$/, "")}/${path}`
  return path
}

/** Workspace-relative form of `path` for the hover card — absolute paths under
 *  `rootPath` are shown relative so the interesting part isn't truncated away. */
function displayPath(path: string, rootPath?: string): string {
  if (!rootPath || !path.startsWith("/")) return path
  const root = rootPath.replace(/\/$/, "")
  return path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path
}

/** Number of lines shown in the hover peek — centered on the referenced line. */
const PEEK_LINE_COUNT = 9

/** Slices `content` down to a ~9-line window centered on `line` (1-indexed),
 *  or the first 9 lines when no line was referenced. Clamps at file boundaries
 *  instead of shrinking the window near the top/bottom of the file. Returns the
 *  1-indexed number of the first row so callers can render a gutter. */
function peekWindow(
  content: string,
  line?: number
): { start: number; rows: string[] } {
  const all = content.split("\n")
  // A trailing newline yields a phantom empty last row — drop it for display.
  if (all.length > 1 && all[all.length - 1] === "") all.pop()
  if (!line) return { start: 1, rows: all.slice(0, PEEK_LINE_COUNT) }
  const half = Math.floor(PEEK_LINE_COUNT / 2)
  const centerIdx = Math.max(0, line - 1)
  const startIdx = Math.max(
    0,
    Math.min(centerIdx - half, all.length - PEEK_LINE_COUNT)
  )
  return {
    start: startIdx + 1,
    rows: all.slice(startIdx, startIdx + PEEK_LINE_COUNT),
  }
}

/** Line-numbered code peek. Rows inside [line, endLine] get the accent
 *  treatment so the referenced code pops out of its surrounding context. */
function PeekBlock({
  content,
  line,
  endLine,
}: {
  content: string
  line?: number
  endLine?: number
}) {
  const { start, rows } = peekWindow(content, line)
  if (rows.length === 0 || (rows.length === 1 && rows[0] === "")) {
    return (
      <div className="w-full px-3 py-2.5 text-2xs text-muted-foreground italic">
        Empty file
      </div>
    )
  }
  const digits = String(start + rows.length - 1).length
  const hiEnd = endLine ?? line
  return (
    <div className="w-full overflow-hidden bg-muted/30 py-1 font-mono text-2xs leading-relaxed">
      {rows.map((text, i) => {
        const no = start + i
        const highlighted = line != null && no >= line && no <= hiEnd!
        return (
          <div key={no} className={cn("flex", highlighted && "bg-primary/10")}>
            <span
              className={cn(
                "shrink-0 pr-2.5 pl-3 whitespace-pre select-none",
                highlighted
                  ? "font-semibold text-primary"
                  : "text-muted-foreground/50"
              )}
            >
              {String(no).padStart(digits)}
            </span>
            <span
              className={cn(
                "overflow-hidden pr-3 whitespace-pre",
                highlighted ? "text-foreground" : "text-foreground/75"
              )}
            >
              {text || " "}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export function FileChip({
  path,
  line,
  endLine,
  location,
  rootPath: rootPathProp,
}: {
  /** File path as written in the message — relative or absolute. */
  path: string
  /** Start line of the reference, used to center the peek and scroll on open. */
  line?: number
  /** End line when the reference is a range (`:8-14`). */
  endLine?: number
  /** Raw location suffix without the leading colon (e.g. `8`, `8:3`, `8-14`). */
  location?: string
  /** Workspace root; falls back to the nearest FileChipGitProvider's root. */
  rootPath?: string
}) {
  const [hasHovered, setHasHovered] = useState(false)
  const contextRootPath = useFileChipRootPath()
  const rootPath = rootPathProp ?? contextRootPath

  const normalizedPath = path.replace(/\/+$/, "")
  const basename = normalizedPath.split("/").pop() || normalizedPath
  const absolutePath = resolveAbsolutePath(path, rootPath)

  const changedFile = useFileChipGitStatus(path)
  const label = changedFile ? statusLabel(changedFile) : undefined
  const isDeleted = label === "D"

  // Fetch is enabled on first tooltip open and stays on — React Query's
  // staleTime then serves repeat hovers of the same chip from cache.
  const peek = useFilePeek(absolutePath, hasHovered)
  const notFound = peek.data?.notFound === true

  const stats = useMemo(() => {
    if (!peek.data || peek.data.notFound) return null
    const content = peek.data.content
    const lines =
      content === ""
        ? 0
        : content.split("\n").length - (content.endsWith("\n") ? 1 : 0)
    return { lines, bytes: new Blob([content]).size }
  }, [peek.data])

  const language = languageName(basename)
  const relPath = displayPath(path, rootPath)
  const locationSuffix = location != null ? `:${location}` : ""
  const rangeText =
    line != null
      ? endLine != null && endLine !== line
        ? `Lines ${line}–${endLine}`
        : `Line ${line}`
      : null

  function handleClick() {
    openFileTab({
      filePath: absolutePath,
      title: basename,
      workspacePath: rootPath,
      scrollToLine: line,
    })
  }

  const dotSeparator = <span className="text-muted-foreground/40">·</span>

  return (
    <TooltipProvider delay={250}>
      <Tooltip
        onOpenChange={(open) => {
          if (open) setHasHovered(true)
        }}
      >
        <TooltipTrigger
          render={
            // A real <button> is an atomic inline-block and can't fragment
            // across lines — a plain <code> run wraps mid-path like the
            // surrounding markdown text.
            <code
              role="button"
              tabIndex={0}
              onClick={handleClick}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  handleClick()
                }
              }}
              className={cn(
                // The mono glyphs at 13px optically sink below the chat font's
                // baseline — the 1px vertical-align raise re-centers them.
                "cursor-pointer align-[1px] font-mono text-[0.8125rem] break-all text-primary underline decoration-[0.5px] underline-offset-4 transition-[filter] hover:brightness-125 focus-visible:outline-none",
                isDeleted && "line-through opacity-70",
                notFound && !isDeleted && "opacity-60"
              )}
            >
              {relPath}
              {locationSuffix}
            </code>
          }
        />
        <TooltipContent
          side="top"
          align="start"
          sideOffset={8}
          className="w-80 max-w-[calc(100vw-2rem)] flex-col items-stretch gap-0 overflow-hidden p-0"
        >
          {/* Header: icon · basename · status pill, full path underneath */}
          <div className="flex w-full items-center gap-2.5 border-b border-foreground/10 px-3 py-2.5">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-foreground/5">
              <Icon
                icon={`catppuccin:${getIconName(basename)}`}
                className="size-4"
                aria-hidden
              />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "truncate text-xs font-medium",
                    isDeleted && "line-through"
                  )}
                >
                  {basename}
                </span>
                {label && (
                  <span
                    className={cn(
                      "ml-auto shrink-0 rounded-sm px-1.5 py-px text-3xs font-semibold",
                      statusBadgeClasses(label)
                    )}
                  >
                    {STATUS_NAMES[label] ?? "Changed"}
                  </span>
                )}
              </div>
              <span className="font-mono text-3xs leading-snug break-all text-muted-foreground">
                {relPath}
                {locationSuffix}
              </span>
            </div>
          </div>

          {/* Stats: language · lines · size · referenced line */}
          {stats && (
            <div className="flex w-full items-center gap-1.5 border-b border-foreground/10 px-3 py-1.5 text-3xs text-muted-foreground">
              {language && (
                <>
                  <span className="font-medium text-foreground/70">
                    {language}
                  </span>
                  {dotSeparator}
                </>
              )}
              <span>
                {stats.lines.toLocaleString()}{" "}
                {stats.lines === 1 ? "line" : "lines"}
              </span>
              {dotSeparator}
              <span>{formatBytes(stats.bytes)}</span>
              {rangeText && (
                <>
                  {dotSeparator}
                  <span className="font-medium text-foreground/70">
                    {rangeText}
                  </span>
                </>
              )}
            </div>
          )}

          {/* Peek / not-found / loading */}
          {notFound ? (
            <div className="w-full px-3 py-2.5 text-2xs text-muted-foreground italic">
              {isDeleted
                ? "Deleted in this change"
                : "File not found in the workspace"}
            </div>
          ) : peek.data ? (
            <PeekBlock
              content={peek.data.content}
              line={line}
              endLine={endLine}
            />
          ) : (
            <div className="w-full px-3 py-2.5 text-2xs text-muted-foreground/60">
              Loading preview…
            </div>
          )}

          {/* Footer hint */}
          {!notFound && (
            <div className="w-full border-t border-foreground/10 bg-muted/40 px-3 py-1.5 text-3xs text-muted-foreground">
              Click to open in review panel
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
