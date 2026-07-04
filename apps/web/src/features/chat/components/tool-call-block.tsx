import { lazy, memo, Suspense, useEffect, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import {
  AlertCircleIcon,
  AlertTriangleIcon,
  ArrowRightIcon,
  BrainIcon,
  CheckIcon,
  CircleDotIcon,
  CircleSlashIcon,
  ContainerIcon,
  CopyIcon,
  DownloadIcon,
  FilePenLineIcon,
  FilePlus2Icon,
  FileTextIcon,
  GlobeIcon,
  InfoIcon,
  ListTodoIcon,
  MessageCircleQuestionIcon,
  PinIcon,
  SearchIcon,
  SquareTerminalIcon,
  WrenchIcon,
} from "lucide-react"
import { FileIcon } from "@/shared/ui/file-icon"
import { McpIcon } from "@/shared/ui/mcp-icon"
import { Badge } from "@/shared/ui/badge"

import { cn } from "@/shared/lib/utils"
import {
  CollapsibleBody,
  DISCLOSURE_DIM,
  DISCLOSURE_LABEL_DONE,
  DISCLOSURE_ROW_CLASS,
  DisclosureChevron,
} from "./disclosure"
import { LivePre } from "./live-pre"
import {
  chatProseClass,
  markdownComponents,
  remarkPlugins,
} from "./markdown-components"
import { DiffView, detectLanguage, parseDiffCounts } from "@/features/git"
import { useSyntaxTheme } from "@/features/themes"
import { RollingTimerText } from "./working-block"
import { WriteView } from "./write-view"
import { PlanSavedCard } from "./plan-saved-card"
import { QUESTION_TOOL_NAME } from "../lib/active-question"
import type { ToolMessage } from "../types"

const PrismCode = lazy(() => import("./prism-code"))

const PLAN_DIR_PREFIX = ".lamda/plans/"

// ── Edit tool detection ────────────────────────────────────────────────────────

interface EditArgs {
  path: string
  edits: { oldText: string; newText: string }[]
}

function isEditArgs(args: unknown): args is EditArgs {
  if (typeof args !== "object" || args === null) return false
  const a = args as Record<string, unknown>
  return typeof a.path === "string" && Array.isArray(a.edits)
}

export function getEditDiff(result: unknown): string | null {
  if (typeof result !== "object" || result === null) return null
  const details = (result as Record<string, unknown>).details
  if (typeof details !== "object" || details === null) return null
  const diff = (details as Record<string, unknown>).diff
  return typeof diff === "string" ? diff : null
}

// ── Plan tool detection ────────────────────────────────────────────────────────

/**
 * The `plan` tool dispatches on an `operation` arg (list/read/write). Returns the
 * operation when this is a `plan` call, so read/write rendering can treat a plan
 * read like a read and a plan write like a write. Null for any other tool.
 */
function getPlanOperation(
  toolName: string,
  args: unknown
): "list" | "read" | "write" | null {
  if (toolName.toLowerCase() !== "plan") return null
  const op =
    args && typeof args === "object"
      ? (args as Record<string, unknown>).operation
      : null
  return op === "list" || op === "read" || op === "write" ? op : null
}

// ── Write tool detection ───────────────────────────────────────────────────────

interface WriteArgs {
  path: string
  content: string
}

function isWriteArgs(args: unknown): args is WriteArgs {
  if (typeof args !== "object" || args === null) return false
  const a = args as Record<string, unknown>
  return typeof a.path === "string" && typeof a.content === "string"
}

/**
 * Detect a plan-mode artifact write (a write into `.lamda/plans/*.md`).
 * Returns workspace-relative + absolute paths, or null if the write doesn't
 * target the plan dir.
 */
function planWriteMeta(
  rawPath: string,
  rootPath: string | undefined
): { relativePath: string; absolutePath: string } | null {
  if (!rawPath.toLowerCase().endsWith(".md")) return null
  const root = rootPath
    ? rootPath.endsWith("/")
      ? rootPath
      : rootPath + "/"
    : null
  let rel = rawPath
  let abs = rawPath
  if (rawPath.startsWith("/")) {
    if (!root || !rawPath.startsWith(root)) return null
    rel = rawPath.slice(root.length)
  } else if (root) {
    abs = root + rawPath
  }
  rel = rel.replace(/\\/g, "/")
  if (!rel.startsWith(PLAN_DIR_PREFIX)) return null
  if (rel.includes("/../")) return null
  return { relativePath: rel, absolutePath: abs }
}

// ── Generic result ─────────────────────────────────────────────────────────────

function getResultText(msg: ToolMessage): string | null {
  // Prefer final result, fall back to partial result during execution
  const resultSource = msg.result ?? msg.partialResult
  if (resultSource === undefined) return null
  if (typeof resultSource === "string") return resultSource
  if (
    typeof resultSource === "object" &&
    resultSource !== null &&
    Array.isArray((resultSource as Record<string, unknown>).content)
  ) {
    const parts = (
      resultSource as { content: { type: string; text?: string }[] }
    ).content
    const text = parts
      .filter((p) => p.type === "text" && typeof p.text === "string")
      .map((p) => p.text)
      .join("")
    // A recognised content-array result: return its text, or null when it holds
    // no text parts (e.g. an image-only screenshot result). Crucially we do NOT
    // fall through to JSON.stringify here — that would dump a giant base64 blob
    // for image content. Images are surfaced separately via getResultImages.
    return text || null
  }
  return JSON.stringify(resultSource, null, 2)
}

// ── Result images ──────────────────────────────────────────────────────────────
//
// Tools (notably MCP tools and screenshot/browser tools) can return image
// content blocks alongside or instead of text. They arrive in the MCP shape
// `{ type: "image", data: <base64>, mimeType }` inside the result `content`
// array (see packages/mcp/src/client.ts formatToolContent). We pull them out so
// the chat can render the screenshot inline rather than dropping it.

interface ResultImage {
  dataUrl: string
  alt: string
}

function getResultImages(msg: ToolMessage): ResultImage[] {
  const resultSource = msg.result ?? msg.partialResult
  if (typeof resultSource !== "object" || resultSource === null) return []
  const content = (resultSource as Record<string, unknown>).content
  if (!Array.isArray(content)) return []
  const images: ResultImage[] = []
  for (const part of content) {
    if (
      typeof part !== "object" ||
      part === null ||
      (part as Record<string, unknown>).type !== "image"
    )
      continue
    const p = part as Record<string, unknown>
    const mimeType = typeof p.mimeType === "string" ? p.mimeType : "image/png"
    // Flat MCP/pi shape: { data, mimeType }. Also tolerate an Anthropic-style
    // `{ source: { data, media_type } }` envelope just in case a provider sends
    // one through.
    let data = typeof p.data === "string" ? p.data : null
    let mime = mimeType
    if (!data && typeof p.source === "object" && p.source !== null) {
      const src = p.source as Record<string, unknown>
      if (typeof src.data === "string") data = src.data
      if (typeof src.media_type === "string") mime = src.media_type
    }
    if (!data) continue
    const dataUrl = data.startsWith("data:")
      ? data
      : `data:${mime};base64,${data}`
    images.push({ dataUrl, alt: `${toolDisplayName(msg.toolName)} screenshot` })
  }
  return images
}

function toRelativePath(p: string, rootPath?: string): string {
  if (!rootPath) return p
  const root = rootPath.endsWith("/") ? rootPath : rootPath + "/"
  return p.startsWith(root) ? p.slice(root.length) : p
}

export function fileBasename(filePath: string): string {
  return filePath.split("/").pop() ?? filePath
}

// ── MCP tool detection ───────────────────────────────────────────────────────
//
// MCP tools are registered with an `mcp__` prefix by the converter
// (packages/mcp/src/converter.ts), so the chat can recognise them by name.

const MCP_TOOL_PREFIX = "mcp__"

export function isMcpTool(toolName: string): boolean {
  return toolName.startsWith(MCP_TOOL_PREFIX)
}

/** Display label for a tool — strips the internal `mcp__` namespace prefix. */
export function toolDisplayName(toolName: string): string {
  return isMcpTool(toolName) ? toolName.slice(MCP_TOOL_PREFIX.length) : toolName
}

/** Small leading glyph that identifies the tool kind at a glance. */
export function ToolGlyph({
  toolName,
  className,
}: {
  toolName: string
  className?: string
}) {
  // MCP tools win first: their server-defined names can contain any substring
  // (e.g. "search", "edit"), so the prefix check must precede the heuristics.
  if (isMcpTool(toolName)) return <McpIcon className={className} />
  const name = toolName.toLowerCase()
  const Icon =
    name === "bash" || name.includes("terminal") || name.includes("command")
      ? SquareTerminalIcon
      : name === "memory"
        ? BrainIcon
        : name.includes("edit")
          ? FilePenLineIcon
          : name === "write"
            ? FilePlus2Icon
            : name === "read" || name === "plan"
              ? FileTextIcon
              : name.includes("fetch") || name.includes("web")
                ? GlobeIcon
                : name.includes("grep") ||
                    name.includes("glob") ||
                    name.includes("search") ||
                    name === "find"
                  ? SearchIcon
                  : WrenchIcon
  return <Icon className={className} />
}

export function argsSummary(args: unknown, rootPath?: string): string {
  if (typeof args !== "object" || args === null) return ""
  const a = args as Record<string, unknown>
  if (typeof a.command === "string") return a.command
  if (typeof a.path === "string") return toRelativePath(a.path, rootPath)
  if (typeof a.file_path === "string")
    return toRelativePath(a.file_path, rootPath)
  if (typeof a.file === "string") return toRelativePath(a.file, rootPath)
  if (typeof a.pattern === "string") return a.pattern
  const first = Object.values(a)[0]
  return typeof first === "string" ? first : ""
}

// ── Question tool description ──────────────────────────────────────────────────

/** Pull the human-readable question prompts out of a `question` tool's args. */
function getQuestionPrompts(args: unknown): string[] {
  if (typeof args !== "object" || args === null) return []
  const list = (args as { questions?: unknown }).questions
  if (!Array.isArray(list)) return []
  return list
    .map((q) =>
      q &&
      typeof q === "object" &&
      typeof (q as Record<string, unknown>).question === "string"
        ? ((q as Record<string, unknown>).question as string).trim()
        : ""
    )
    .filter(Boolean)
}

/** Returned to the agent when the turn is aborted before the user answers. */
const QUESTION_DISMISSED =
  "[The user dismissed the question without answering.]"

/**
 * Recover each question's chosen answer from the tool result. The result is the
 * `formatAnswer` string the picker sends back — `"<question>\n→ <answer>"` blocks
 * — so we slice out the text between each prompt's `→ ` marker and the next
 * prompt. Returns one entry per prompt ("" when not found).
 */
function parseQuestionAnswers(prompts: string[], result: string): string[] {
  if (!result) return prompts.map(() => "")
  return prompts.map((prompt, i) => {
    const marker = `${prompt}\n→ `
    const start = result.indexOf(marker)
    if (start === -1) return ""
    const from = start + marker.length
    let end = result.length
    const next = prompts[i + 1]
    if (next) {
      const nextAt = result.indexOf(`${next}\n→ `, from)
      if (nextAt !== -1) end = nextAt
    }
    return result.slice(from, end).trim()
  })
}

// ── Read tool detection ────────────────────────────────────────────────────────

function getReadFilePath(args: unknown): string | null {
  if (typeof args !== "object" || args === null) return null
  const a = args as Record<string, unknown>
  if (typeof a.file_path === "string") return a.file_path
  if (typeof a.path === "string") return a.path
  return null
}

function isReadTool(toolName: string, args: unknown): boolean {
  const name = toolName.toLowerCase()
  const isRead = name === "read" || getPlanOperation(toolName, args) === "read"
  return isRead && getReadFilePath(args) !== null
}

/**
 * Detect a Read that targets a skill's `SKILL.md` and return the skill name.
 * Skills live at `…/skills/<name>/SKILL.md` (under .agents, .claude, .pi, etc.),
 * so we require both a `skills/` segment and a `SKILL.md` leaf, and take the
 * directory holding it as the skill name. Returns null for ordinary reads.
 */
function getReadSkillName(filePath: string | null): string | null {
  if (!filePath) return null
  const norm = filePath.replace(/\\/g, "/")
  if (!/(^|\/)SKILL\.md$/i.test(norm)) return null
  if (!/(^|\/)skills\//i.test(norm)) return null
  const parts = norm.split("/")
  const name = parts[parts.length - 2]
  return name || null
}

interface SkillFrontmatter {
  description: string | null
  tools: string | null
  body: string
}

/**
 * Parse a skill's `SKILL.md` content into its frontmatter description, allowed
 * tools, and instruction body. Skill loads render these as a structured card
 * instead of a raw markdown dump, so the reader sees what the skill does and
 * what it can touch. Falls back to treating the whole text as the body when no
 * frontmatter is present (e.g. while the read is still streaming).
 */
function parseSkillFrontmatter(text: string | null): SkillFrontmatter {
  if (!text) return { description: null, tools: null, body: "" }
  // Strip a leading UTF-8 BOM before matching so frontmatter is detected even
  // when the file was written with one.
  const stripped = text.replace(/^\uFEFF/, "")
  const m = stripped.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!m) return { description: null, tools: null, body: stripped.trim() }
  const [, frontmatter, body] = m
  const field = (key: string): string | null => {
    const v = frontmatter
      .match(new RegExp(`^${key}:\\s*(.+)$`, "im"))?.[1]
      ?.trim()
    return v ? v.replace(/^["']|["']$/g, "") : null
  }
  return {
    description: field("description"),
    tools: field("allowed-tools") ?? field("tools"),
    body: body.trim(),
  }
}

/**
 * True when a tool message is a Read of a skill's `SKILL.md`. Used by the
 * working block to keep skill loads out of "Read · N files" run groups —
 * they render as a distinct Skill row instead.
 */
export function isSkillRead(msg: ToolMessage): boolean {
  const name = msg.toolName.toLowerCase()
  if (name !== "read") return false
  return getReadSkillName(getReadFilePath(msg.args)) !== null
}

/**
 * Formats the line range a Read covers from its `offset` (1-based start line)
 * and `limit` (line count) args, e.g. "L40–89", "L40+", or null for a full read.
 */
function getReadLineRange(args: unknown): string | null {
  if (typeof args !== "object" || args === null) return null
  const a = args as Record<string, unknown>
  const offset =
    typeof a.offset === "number" && Number.isFinite(a.offset) ? a.offset : null
  const limit =
    typeof a.limit === "number" && Number.isFinite(a.limit) ? a.limit : null
  if (offset === null && limit === null) return null
  const start = offset ?? 1
  if (limit === null) return `L${start}+`
  const end = start + limit - 1
  return start === end ? `L${start}` : `L${start}–${end}`
}

// ── LSP diagnostics ───────────────────────────────────────────────────────────

interface LspRangeLite {
  start?: { line?: number; character?: number }
  end?: { line?: number; character?: number }
}

interface LspDiagnosticLite {
  message: string
  severity: number | null
  range: LspRangeLite | null
  source: string | null
  code: string | null
}

interface LspDisplay {
  label: string
  summary: string | null
  filePath: string | null
  diagnostics: LspDiagnosticLite[]
  error: string | null
  parsed: boolean
  counts: Record<"error" | "warning" | "info" | "hint", number>
}

function getLspFilePath(args: unknown): string | null {
  if (typeof args !== "object" || args === null) return null
  const file = (args as Record<string, unknown>).file
  return typeof file === "string" ? file : null
}

function parseLspRange(raw: unknown): LspRangeLite | null {
  if (typeof raw !== "object" || raw === null) return null
  const range = raw as Record<string, unknown>
  const parsePosition = (value: unknown) => {
    if (typeof value !== "object" || value === null) return undefined
    const pos = value as Record<string, unknown>
    return {
      line: typeof pos.line === "number" ? pos.line : undefined,
      character: typeof pos.character === "number" ? pos.character : undefined,
    }
  }
  return {
    start: parsePosition(range.start),
    end: parsePosition(range.end),
  }
}

function parseLspDiagnostic(raw: unknown): LspDiagnosticLite | null {
  if (typeof raw !== "object" || raw === null) return null
  const d = raw as Record<string, unknown>
  if (typeof d.message !== "string") return null
  const code = d.code
  return {
    message: d.message,
    severity: typeof d.severity === "number" ? d.severity : null,
    range: parseLspRange(d.range),
    source: typeof d.source === "string" ? d.source : null,
    code:
      typeof code === "string" || typeof code === "number"
        ? String(code)
        : null,
  }
}

function lspSeverityKind(
  severity: number | null
): "error" | "warning" | "info" | "hint" {
  if (severity === 1) return "error"
  if (severity === 2) return "warning"
  if (severity === 4) return "hint"
  return "info"
}

function lspSeverityLabel(severity: number | null): string {
  const kind = lspSeverityKind(severity)
  return kind === "info" ? "information" : kind
}

function formatLspPosition(range: LspRangeLite | null): string | null {
  const line = range?.start?.line
  const character = range?.start?.character
  if (typeof line !== "number") return null
  const lineLabel = `L${line + 1}`
  return typeof character === "number"
    ? `${lineLabel}:${character + 1}`
    : lineLabel
}

function summarizeLspCounts(counts: LspDisplay["counts"]): string {
  const parts = [
    ["error", counts.error] as const,
    ["warning", counts.warning] as const,
    ["information", counts.info] as const,
    ["hint", counts.hint] as const,
  ]
    .filter(([, count]) => count > 0)
    .map(([label, count]) => `${count} ${label}${count === 1 ? "" : "s"}`)
  return parts.join(", ")
}

function describeLsp(msg: ToolMessage, resultText: string | null): LspDisplay {
  const diagnostics: LspDiagnosticLite[] = []
  let error: string | null = null
  let parsed = true

  if (resultText) {
    try {
      const payload = JSON.parse(resultText) as Record<string, unknown>
      if (typeof payload.error === "string") {
        error = payload.error
      }
      if (Array.isArray(payload.diagnostics)) {
        diagnostics.push(
          ...payload.diagnostics
            .map(parseLspDiagnostic)
            .filter((d): d is LspDiagnosticLite => d !== null)
        )
      } else if (!error) {
        parsed = false
      }
    } catch {
      parsed = false
    }
  }

  const counts = diagnostics.reduce<LspDisplay["counts"]>(
    (acc, diagnostic) => {
      acc[lspSeverityKind(diagnostic.severity)] += 1
      return acc
    },
    { error: 0, warning: 0, info: 0, hint: 0 }
  )

  const countSummary = summarizeLspCounts(counts)
  const filePath = getLspFilePath(msg.args)
  const fileName = filePath ? fileBasename(filePath) : null

  let label = "Checked diagnostics"
  let summary: string | null = fileName
  if (msg.status === "running") {
    label = "Checking diagnostics"
    summary = fileName ? `Language server is checking ${fileName}` : null
  } else if (msg.status === "error") {
    label = "LSP diagnostics failed"
  } else if (error) {
    label = "No language server"
    summary = fileName ? `${fileName} · ${error}` : error
  } else if (diagnostics.length === 0 && parsed) {
    label = "No diagnostics found"
    summary = fileName ? `${fileName} is clean` : "File is clean"
  } else if (countSummary) {
    label = `Found ${diagnostics.length} diagnostic${
      diagnostics.length === 1 ? "" : "s"
    }`
    summary = fileName ? `${fileName} · ${countSummary}` : countSummary
  }

  return {
    label,
    summary,
    filePath,
    diagnostics,
    error,
    parsed,
    counts,
  }
}

function LspSeverityIcon({
  severity,
  className,
}: {
  severity: number | null
  className?: string
}) {
  const kind = lspSeverityKind(severity)
  const Icon =
    kind === "error"
      ? AlertCircleIcon
      : kind === "warning"
        ? AlertTriangleIcon
        : kind === "hint"
          ? CircleDotIcon
          : InfoIcon
  return <Icon className={className} />
}

function LspCountBadge({
  label,
  count,
  variant = "outline",
}: {
  label: string
  count: number
  variant?: "outline" | "destructive" | "secondary"
}) {
  if (count === 0) return null
  return (
    <Badge variant={variant} className="h-5 rounded-sm px-1.5 font-mono">
      {count} {label}
    </Badge>
  )
}

function LspView({
  lsp,
  rawText,
  live,
}: {
  lsp: LspDisplay
  rawText: string | null
  live: boolean
}) {
  if (!lsp.parsed && rawText) return <LivePre text={rawText} live={live} />

  if (lsp.error) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-border/50 bg-background/40 px-3 py-2">
        <CircleSlashIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/45" />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-xs font-medium text-foreground/75">
            Language server unavailable
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground/70">
            {lsp.error}
          </p>
        </div>
      </div>
    )
  }

  if (live && lsp.diagnostics.length === 0) {
    return (
      <span className="animate-thinking-shimmer bg-linear-to-r from-muted-foreground/30 via-foreground/80 to-muted-foreground/30 bg-size-[200%_100%] bg-clip-text text-transparent">
        Waiting for diagnostics from the language server
      </span>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 rounded-md border border-border/50 bg-background/40 px-3 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <LspCountBadge
            label="errors"
            count={lsp.counts.error}
            variant="destructive"
          />
          <LspCountBadge label="warnings" count={lsp.counts.warning} />
          <LspCountBadge
            label="info"
            count={lsp.counts.info}
            variant="secondary"
          />
          <LspCountBadge
            label="hints"
            count={lsp.counts.hint}
            variant="secondary"
          />
          {lsp.diagnostics.length === 0 && (
            <Badge variant="secondary" className="h-5 rounded-sm px-1.5">
              clean
            </Badge>
          )}
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground/70">
          {lsp.diagnostics.length === 0
            ? "The language server did not report errors, warnings, information messages, or hints for this file."
            : `The language server reported ${summarizeLspCounts(
                lsp.counts
              )} for this file.`}
        </p>
      </div>

      {lsp.diagnostics.length > 0 && (
        <div className="flex max-h-72 flex-col gap-1.5 overflow-auto">
          {lsp.diagnostics.map((diagnostic, i) => {
            const kind = lspSeverityKind(diagnostic.severity)
            const position = formatLspPosition(diagnostic.range)
            return (
              <div
                key={i}
                className="flex items-start gap-2 rounded-md border border-border/40 bg-background/35 px-2.5 py-2"
              >
                <LspSeverityIcon
                  severity={diagnostic.severity}
                  className={cn(
                    "mt-0.5 h-3.5 w-3.5 shrink-0",
                    kind === "error"
                      ? "text-destructive/75"
                      : kind === "warning"
                        ? "text-amber-500/75"
                        : "text-muted-foreground/55"
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-1.5">
                    <span className="font-medium text-foreground/75">
                      {lspSeverityLabel(diagnostic.severity)}
                    </span>
                    {position && (
                      <span className="font-mono text-2xs text-muted-foreground/50">
                        {position}
                      </span>
                    )}
                    {diagnostic.source && (
                      <span className="text-2xs text-muted-foreground/45">
                        {diagnostic.source}
                      </span>
                    )}
                    {diagnostic.code && (
                      <span className="font-mono text-2xs text-muted-foreground/40">
                        {diagnostic.code}
                      </span>
                    )}
                  </div>
                  <p className="text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground/80">
                    {diagnostic.message}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Todo tool description ──────────────────────────────────────────────────────

interface TodoTaskLite {
  id: string
  content: string
  status: string
}
interface TodoGoalLite {
  id: string
  description: string
  status: string
  tasks: TodoTaskLite[]
}

/** Parse the `goals` snapshot out of a todo tool result, if present. */
function parseTodoGoals(msg: ToolMessage): TodoGoalLite[] | null {
  const text = getResultText(msg)
  if (!text) return null
  try {
    const obj = JSON.parse(text) as Record<string, unknown>
    if (Array.isArray(obj.goals)) return obj.goals as TodoGoalLite[]
  } catch {
    /* ignore non-JSON results */
  }
  return null
}

/** Find a task by id across every goal in the snapshot. */
function findTodoTask(
  goals: TodoGoalLite[] | null,
  id: string
): TodoTaskLite | null {
  if (!goals || !id) return null
  for (const g of goals) {
    const t = g.tasks?.find((task) => task.id === id)
    if (t) return t
  }
  return null
}

type TodoTone = "active" | "done" | "error"

/**
 * Build a verbose label for a todo tool call, naming the concrete task that was
 * created / started / completed rather than a generic "Task updated".
 */
function describeTodo(msg: ToolMessage): { label: string; tone: TodoTone } {
  if (msg.status === "error") return { label: "todo failed", tone: "error" }

  const a =
    typeof msg.args === "object" && msg.args !== null
      ? (msg.args as Record<string, unknown>)
      : {}
  const op = typeof a.operation === "string" ? a.operation : undefined
  const running = msg.status === "running"

  if (op === "create") {
    const goal = typeof a.goal === "string" ? a.goal.trim() : null
    const n = Array.isArray(a.items) ? a.items.length : 0
    if (running) {
      return {
        label: goal ? `Creating "${goal}"` : "Creating tasks",
        tone: "active",
      }
    }
    const count = `${n} task${n === 1 ? "" : "s"}`
    return {
      label: goal ? `Created "${goal}" · ${count}` : "Tasks created",
      tone: "done",
    }
  }

  if (op === "update") {
    const id = typeof a.id === "string" ? a.id : ""
    const status = typeof a.status === "string" ? a.status : undefined
    const task = findTodoTask(parseTodoGoals(msg), id)
    const content =
      task?.content ?? (typeof a.content === "string" ? a.content.trim() : null)

    if (status === "completed") {
      if (content) return { label: `Completed "${content}"`, tone: "done" }
      return {
        label: running ? "Completing task" : "Task completed",
        tone: "done",
      }
    }
    if (status === "in_progress") {
      if (content)
        return {
          label: `Working on "${content}"`,
          tone: running ? "active" : "done",
        }
      return {
        label: running ? "Starting task" : "Task in progress",
        tone: "active",
      }
    }
    if (content) return { label: `Updated: ${content}`, tone: "done" }
    return { label: running ? "Updating task" : "Task updated", tone: "done" }
  }

  if (op === "delete") {
    const id = typeof a.id === "string" ? a.id : ""
    const content = findTodoTask(parseTodoGoals(msg), id)?.content
    if (content) return { label: `Removed: ${content}`, tone: "done" }
    return { label: running ? "Removing task" : "Task removed", tone: "done" }
  }

  return { label: running ? "Loading tasks" : "Tasks", tone: "done" }
}

// ── Memory tool ────────────────────────────────────────────────────────────────
//
// The memory tool's result is a JSON payload ({ operation, memories, message }
// or { error }). Rendering that raw reads as debug output, so the row gets a
// verbose operation label ("Saved memory", "Found 3 memories"), the memory
// title / search query as its summary, scope/kind/pin chips, and the expanded
// body shows each memory as a structured card instead of JSON.

interface MemoryItemLite {
  id: string
  scope: "user" | "workspace"
  title: string
  content: string
  category: string | null
  kind: string
  pinned: boolean
}

interface MemoryDisplay {
  /** Verbose header label, e.g. "Saved memory" / "Found 3 memories". */
  label: string
  /** Header summary (memory title / search query / scope filter), if any. */
  summary: string | null
  /** Memory whose scope/kind/pin chips show in the header (save/update). */
  headerItem: MemoryItemLite | null
  /** Memories rendered as cards in the expanded body. */
  memories: MemoryItemLite[]
  /** Outcome note worth surfacing (reinforced / superseded / error text). */
  message: string | null
  /** The tool reported a failure (it returns errors as normal results). */
  failed: boolean
  /**
   * The result decoded as the expected payload (or there is none yet). False
   * means an unexpected shape — the body falls back to the raw result text.
   */
  parsed: boolean
}

function parseMemoryItem(raw: unknown): MemoryItemLite | null {
  if (typeof raw !== "object" || raw === null) return null
  const m = raw as Record<string, unknown>
  if (typeof m.title !== "string" || typeof m.content !== "string") return null
  return {
    id: typeof m.id === "string" ? m.id : "",
    scope: m.scope === "user" ? "user" : "workspace",
    title: m.title,
    content: m.content,
    category:
      typeof m.category === "string" && m.category.trim()
        ? m.category.trim()
        : null,
    kind: typeof m.kind === "string" && m.kind ? m.kind : "fact",
    pinned: m.pinned === true,
  }
}

const MEMORY_FAILED_LABELS: Record<string, string> = {
  save: "Couldn't save memory",
  update: "Couldn't update memory",
  delete: "Couldn't delete memory",
  search: "Memory search failed",
  list: "Couldn't list memories",
}

function describeMemory(msg: ToolMessage): MemoryDisplay {
  const a =
    typeof msg.args === "object" && msg.args !== null
      ? (msg.args as Record<string, unknown>)
      : {}
  const op = typeof a.operation === "string" ? a.operation : "save"
  const running = msg.status === "running"

  // The memory in flight, reconstructed from args — lets a save/update card
  // render immediately, before the result lands.
  const argsItem =
    typeof a.title === "string" && typeof a.content === "string"
      ? parseMemoryItem(a)
      : null

  let resultItems: MemoryItemLite[] | null = null
  let message: string | null = null
  let error: string | null = null
  let parsed = true
  const text = getResultText(msg)
  if (!running && text) {
    try {
      const payload = JSON.parse(text) as Record<string, unknown>
      if (typeof payload.error === "string") error = payload.error
      if (typeof payload.message === "string") message = payload.message
      if (Array.isArray(payload.memories)) {
        resultItems = payload.memories
          .map(parseMemoryItem)
          .filter((m): m is MemoryItemLite => m !== null)
      } else if (error === null) {
        parsed = false
      }
    } catch {
      // Non-JSON result — the caller falls back to the raw text.
      parsed = false
    }
  }

  if (error || msg.status === "error") {
    return {
      label: MEMORY_FAILED_LABELS[op] ?? "Memory failed",
      summary: null,
      headerItem: null,
      memories: [],
      message: error,
      failed: true,
      parsed,
    }
  }

  // Confirmations that only repeat the label ("Memory saved…", "Memory
  // updated.", "No matching memories.") are dropped; only outcomes that add
  // information (reinforced / superseded) surface in the body.
  if (
    message &&
    /^(Memory (saved|updated|deleted)|No matching memories)/.test(message)
  ) {
    message = null
  }

  const memories =
    resultItems && resultItems.length > 0
      ? resultItems
      : argsItem
        ? [argsItem]
        : []
  const count = resultItems?.length ?? 0

  switch (op) {
    case "save": {
      let label = running ? "Saving memory" : "Saved memory"
      if (!running && message) {
        if (message.includes("reinforced")) label = "Reinforced memory"
        else if (message.includes("superseded")) label = "Replaced memory"
      }
      return {
        label,
        summary: memories[0]?.title ?? null,
        headerItem: memories[0] ?? null,
        memories,
        message,
        failed: false,
        parsed,
      }
    }
    case "update":
      return {
        label: running ? "Updating memory" : "Updated memory",
        summary: memories[0]?.title ?? null,
        headerItem: memories[0] ?? null,
        memories,
        message,
        failed: false,
        parsed,
      }
    case "delete":
      return {
        label: running ? "Deleting memory" : "Deleted memory",
        summary: null,
        headerItem: null,
        memories: [],
        message,
        failed: false,
        parsed,
      }
    case "search": {
      const query = typeof a.query === "string" ? a.query.trim() : ""
      return {
        label: running
          ? "Searching memories"
          : count === 0
            ? "No memories found"
            : `Found ${count} ${count === 1 ? "memory" : "memories"}`,
        summary: query ? `"${query}"` : null,
        headerItem: null,
        memories: running ? [] : (resultItems ?? []),
        message,
        failed: false,
        parsed,
      }
    }
    case "list": {
      const scope =
        a.scope === "user" || a.scope === "workspace"
          ? (a.scope as string)
          : null
      return {
        label: running
          ? "Listing memories"
          : `Listed ${count} ${count === 1 ? "memory" : "memories"}`,
        summary: scope ? `${scope} scope` : null,
        headerItem: null,
        memories: running ? [] : (resultItems ?? []),
        message,
        failed: false,
        parsed,
      }
    }
    default:
      return {
        label: "Memory",
        summary: null,
        headerItem: null,
        memories,
        message,
        failed: false,
        parsed,
      }
  }
}

/** Tiny labelled chip for a memory's kind / scope / category. */
function MemoryChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="shrink-0 rounded-sm border border-border/50 bg-muted/40 px-1 py-px text-3xs font-medium text-muted-foreground/60">
      {children}
    </span>
  )
}

/**
 * Structured card list for memory results — one card per memory with its
 * title, pin, kind/category/scope chips, and the remembered fact as prose.
 */
function MemoryView({
  memories,
  message,
  failed,
}: {
  memories: MemoryItemLite[]
  message: string | null
  failed: boolean
}) {
  return (
    <div className="flex flex-col gap-2">
      {memories.map((m, i) => (
        <div
          key={m.id || i}
          className="flex flex-col gap-1 rounded-md border border-border/40 bg-background/40 px-2.5 py-2"
        >
          <div className="flex items-center gap-1.5">
            {m.pinned && (
              <PinIcon className="h-3 w-3 shrink-0 text-amber-500/70" />
            )}
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground/80">
              {m.title}
            </span>
            {m.kind !== "fact" && <MemoryChip>{m.kind}</MemoryChip>}
            {m.category && <MemoryChip>{m.category}</MemoryChip>}
            <MemoryChip>
              {m.scope === "user" ? "all projects" : "this project"}
            </MemoryChip>
          </div>
          <p className="max-h-40 overflow-auto text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground/75">
            {m.content}
          </p>
        </div>
      ))}
      {message && (
        <p
          className={cn(
            "text-2xs",
            failed ? "text-destructive/80" : "text-muted-foreground/60 italic"
          )}
        >
          {message}
        </p>
      )}
    </div>
  )
}

// ── ReadView ───────────────────────────────────────────────────────────────────

function ReadView({
  text,
  filePath,
  live,
}: {
  text: string
  filePath: string
  live: boolean
}) {
  const syntax = useSyntaxTheme()
  const language = detectLanguage(filePath) ?? "text"

  return (
    <div className="max-h-64 overflow-auto rounded-md text-xs text-muted-foreground/60">
      <Suspense
        fallback={
          <pre className="overflow-auto px-3 py-2 text-xs text-muted-foreground/60">
            {text}
          </pre>
        }
      >
        <PrismCode
          code={text}
          language={language}
          style={syntax.prism}
          fontSize="0.75rem"
          opacity={live ? 0.5 : 0.72}
        />
      </Suspense>
    </div>
  )
}

// ── SkillView ────────────────────────────────────────────────────────────────

/**
 * Structured view of a loaded skill: its description and allowed tools shown as
 * labelled fields, with the instruction body rendered as markdown. Replaces the
 * raw `SKILL.md` dump so the row reads as "this capability was pulled in" rather
 * than "a file was read".
 */
function SkillView({ skill }: { skill: SkillFrontmatter }) {
  return (
    <div className="flex flex-col gap-3">
      {skill.description && (
        <p className="text-xs leading-relaxed text-foreground/70">
          {skill.description}
        </p>
      )}

      {skill.tools && (
        <div className="flex items-start gap-1.5">
          <WrenchIcon className="mt-px h-3 w-3 shrink-0 text-muted-foreground/40" />
          <span className="min-w-0 font-mono text-2xs leading-relaxed text-muted-foreground/60">
            {skill.tools}
          </span>
        </div>
      )}

      {skill.body && (
        <div className="max-h-72 overflow-auto border-t border-border/40 pt-2">
          <div className={cn(chatProseClass, "text-xs opacity-70")}>
            <ReactMarkdown
              remarkPlugins={remarkPlugins}
              components={markdownComponents}
            >
              {skill.body}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  )
}

// ── ImageView ────────────────────────────────────────────────────────────────

/**
 * Renders screenshots / images returned in a tool result. Each image is capped
 * in height inline and opens full-size in a new tab on click, so a browser or
 * screenshot tool's output is actually visible in the chat instead of dropped.
 */
function ImageView({ images }: { images: ResultImage[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      {images.map((image, i) => (
        <a
          key={i}
          href={image.dataUrl}
          target="_blank"
          rel="noreferrer"
          className="block w-full cursor-pointer overflow-hidden rounded-md border border-border/50 transition-opacity hover:opacity-90"
        >
          <img
            src={image.dataUrl}
            alt={image.alt}
            className="h-auto w-full object-contain"
          />
        </a>
      ))}
    </div>
  )
}

// ── ToolCallBlock ──────────────────────────────────────────────────────────────

export const ToolCallBlock = memo(function ToolCallBlock({
  msg,
  isNew = true,
  entryDelayMs = 0,
  rootPath,
  suppressPlanSavedCard = false,
}: {
  msg: ToolMessage
  isNew?: boolean
  /** Stagger offset (ms) applied as CSS animation-delay when isNew is true. */
  entryDelayMs?: number
  rootPath?: string
  /** When true, render write output inline instead of the plan-ready card UI. */
  suppressPlanSavedCard?: boolean
}) {
  const normalizedToolName = msg.toolName.toLowerCase()
  const isEdit = normalizedToolName === "edit" && isEditArgs(msg.args)
  const diff = isEdit ? getEditDiff(msg.result) : null
  const isMemory = normalizedToolName === "memory"
  const memory = isMemory ? describeMemory(msg) : null
  const isLsp = normalizedToolName === "lsp"
  const isRead = isReadTool(normalizedToolName, msg.args)
  const readFilePath = isRead ? getReadFilePath(msg.args) : null
  const readLineRange = isRead ? getReadLineRange(msg.args) : null
  const skillName = isRead ? getReadSkillName(readFilePath) : null
  const isWrite =
    (normalizedToolName === "write" ||
      getPlanOperation(msg.toolName, msg.args) === "write") &&
    isWriteArgs(msg.args)
  const writeArgs = isWrite ? (msg.args as WriteArgs) : null
  const filePath = isEdit || isWrite ? getReadFilePath(msg.args) : null
  // Reads get the same file-icon + basename row treatment as edits/writes
  const lspFilePath = isLsp ? getLspFilePath(msg.args) : null
  const displayFilePath =
    filePath ?? lspFilePath ?? (skillName ? null : readFilePath)

  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
    }
  }, [])

  // Question tool: the agent paused to ask the user. Render a friendly summary
  // instead of the raw tool name + JSON args. While pending it's a single
  // waiting line (the picker itself replaces the input box, see QuestionView);
  // once answered it lists each question with the answer the user chose.
  if (msg.toolName === QUESTION_TOOL_NAME) {
    const prompts = getQuestionPrompts(msg.args)
    const isPending = msg.status === "running"
    const containerProps = {
      className: cn("w-full text-sm", isNew && "animate-chat-message-in"),
      style:
        isNew && entryDelayMs > 0
          ? { animationDelay: `${entryDelayMs}ms` }
          : undefined,
    }

    if (isPending) {
      const summary =
        prompts.length === 0
          ? "Waiting for your answer"
          : prompts.length === 1
            ? prompts[0]
            : `Asked you ${prompts.length} questions`
      return (
        <div
          {...containerProps}
          className={cn("flex items-center gap-1.5", containerProps.className)}
        >
          <MessageCircleQuestionIcon className="h-3 w-3 shrink-0 text-primary/70" />
          <span className="min-w-0 truncate text-foreground/70">{summary}</span>
        </div>
      )
    }

    const dismissed = (getResultText(msg) ?? "").trim() === QUESTION_DISMISSED
    const answers = dismissed
      ? []
      : parseQuestionAnswers(prompts, getResultText(msg) ?? "")
    const headerLabel = dismissed
      ? "Question dismissed"
      : prompts.length > 1
        ? `Answered ${prompts.length} questions`
        : "Answered"

    return (
      <div {...containerProps}>
        <div className="flex items-center gap-1.5">
          <MessageCircleQuestionIcon className="h-3 w-3 shrink-0 text-muted-foreground/40" />
          <span className="font-medium text-muted-foreground/45">
            {headerLabel}
          </span>
        </div>
        {!dismissed && prompts.length > 0 && (
          <div className="mt-1.5 ml-[1.125rem] flex flex-col gap-1.5">
            {prompts.map((prompt, i) => (
              <div key={i} className="flex flex-col gap-0.5">
                <span className="text-xs text-muted-foreground/70">
                  {prompt}
                </span>
                <span className="flex items-start gap-1 text-xs font-medium text-foreground/80">
                  <ArrowRightIcon
                    className="mt-0.5 h-3 w-3 shrink-0 text-primary/70"
                    strokeWidth={2.5}
                  />
                  <span className="min-w-0 whitespace-pre-wrap">
                    {answers[i] || "—"}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Todo tool: render as a tiny inline pill that names the concrete task — the
  // full list state lives in TodoPanel above the input, so we don't duplicate
  // the card here.
  if (normalizedToolName === "todo") {
    const todo = describeTodo(msg)
    const todoArgs =
      typeof msg.args === "object" && msg.args !== null
        ? (msg.args as Record<string, unknown>)
        : {}
    const isCompleted =
      msg.status === "done" &&
      todoArgs.operation === "update" &&
      todoArgs.status === "completed"
    return (
      <div
        className={cn(
          "flex items-center gap-1.5 text-xs",
          isNew && "animate-chat-message-in"
        )}
        style={
          isNew && entryDelayMs > 0
            ? { animationDelay: `${entryDelayMs}ms` }
            : undefined
        }
      >
        {msg.status === "error" ? (
          <AlertCircleIcon className="h-3 w-3 shrink-0 text-destructive/60" />
        ) : msg.status === "running" ? (
          <CircleDotIcon className="h-3 w-3 shrink-0 animate-pulse text-blue-500/60" />
        ) : isCompleted ? (
          <CheckIcon
            className="h-3 w-3 shrink-0 text-muted-foreground/45"
            strokeWidth={2.5}
          />
        ) : (
          <ListTodoIcon className="h-3 w-3 shrink-0 text-muted-foreground/30" />
        )}
        <span
          className={cn(
            "min-w-0 truncate",
            todo.tone === "active"
              ? "animate-thinking-shimmer bg-linear-to-r from-muted-foreground/40 via-foreground/70 to-muted-foreground/40 bg-size-[200%_100%] bg-clip-text text-transparent"
              : todo.tone === "error"
                ? "text-destructive/60"
                : "text-muted-foreground/45"
          )}
        >
          {todo.label}
        </span>
      </div>
    )
  }

  // Plan-mode writes get a custom card with Review + Implement CTAs.
  // Must come after the hooks above to keep call order stable.
  const planMeta =
    isWrite && writeArgs ? planWriteMeta(writeArgs.path, rootPath) : null
  if (!suppressPlanSavedCard && planMeta && writeArgs) {
    return (
      <PlanSavedCard
        msg={msg}
        relativePath={planMeta.relativePath}
        absolutePath={planMeta.absolutePath}
        content={writeArgs.content}
        isNew={isNew}
        entryDelayMs={entryDelayMs}
      />
    )
  }

  function toggle(e: React.MouseEvent) {
    e.stopPropagation()
    setExpanded((prev) => !prev)
  }

  function handleCopy(e: React.MouseEvent) {
    e.stopPropagation()
    const text = resultText ?? summary
    if (!text) return
    void navigator.clipboard.writeText(text)
    setCopied(true)
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
    copyTimerRef.current = setTimeout(() => setCopied(false), 1500)
  }

  const resultText = getResultText(msg)
  const resultImages = getResultImages(msg)
  const summary = argsSummary(msg.args, rootPath)
  const lsp = isLsp ? describeLsp(msg, resultText) : null

  // Skill loads parse the SKILL.md frontmatter so the row can show the skill's
  // purpose inline and a structured card on expand, instead of a raw file dump.
  const skill = skillName ? parseSkillFrontmatter(resultText) : null

  const editCounts =
    isEdit && msg.status === "done" && diff !== null
      ? parseDiffCounts(diff)
      : null

  const writeLineCount =
    isWrite && writeArgs ? writeArgs.content.split("\n").length : null

  // Body is shown when there is something to render at any status.
  // "running" and "error" must always open the body so their respective
  // placeholder / error block is reachable inside the collapsed grid.
  const showEditContent =
    isEdit &&
    (msg.status === "running" || diff !== null || msg.status === "error")
  const showReadContent =
    isRead &&
    (resultText !== null || msg.status === "running" || msg.status === "error")
  // Write: content is in args from tool_start, always available
  const showWriteContent = isWrite && writeArgs !== null
  const showMemoryContent =
    isMemory &&
    (memory!.memories.length > 0 ||
      memory!.message !== null ||
      (!memory!.parsed && resultText !== null) ||
      msg.status === "running" ||
      msg.status === "error")
  const showLspContent =
    isLsp &&
    (resultText !== null || msg.status === "running" || msg.status === "error")
  const showOtherContent =
    !isEdit &&
    !isRead &&
    !isWrite &&
    !isMemory &&
    !isLsp &&
    (resultText !== null ||
      resultImages.length > 0 ||
      msg.status === "running" ||
      msg.status === "error")

  const hasBody =
    showEditContent ||
    showReadContent ||
    showWriteContent ||
    showMemoryContent ||
    showLspContent ||
    showOtherContent

  // Bash reads as an action, not a tool name: "Running" while the command is in
  // flight, "Ran" once it has finished (or errored — it still ran). Skills read
  // the same way: "Loading" while in flight, "Loaded" once done, with the skill
  // name shown alongside.
  const toolLabel = memory
    ? memory.label
    : lsp
      ? lsp.label
      : skillName
        ? msg.status === "running"
          ? "Loading"
          : "Loaded"
        : normalizedToolName === "bash"
          ? msg.status === "running"
            ? "Running"
            : "Ran"
          : toolDisplayName(msg.toolName)

  return (
    <div
      className={cn("w-full text-xs", isNew && "animate-chat-message-in")}
      style={
        isNew && entryDelayMs > 0
          ? { animationDelay: `${entryDelayMs}ms` }
          : undefined
      }
    >
      {/* Trigger row — text accordion style */}
      <button
        type="button"
        className={DISCLOSURE_ROW_CLASS}
        onClick={toggle}
        aria-expanded={hasBody ? expanded : undefined}
      >
        {skillName ? (
          <DownloadIcon
            className={cn(
              "h-3 w-3 shrink-0",
              msg.status === "running"
                ? "animate-pulse text-foreground/50"
                : msg.status === "error"
                  ? "text-destructive/60"
                  : DISCLOSURE_DIM
            )}
          />
        ) : (
          <ToolGlyph
            toolName={msg.toolName}
            className={cn(
              "h-3 w-3 shrink-0",
              msg.status === "running"
                ? "animate-pulse text-foreground/50"
                : msg.status === "error"
                  ? "text-destructive/60"
                  : DISCLOSURE_DIM
            )}
          />
        )}

        <span
          className={cn(
            "shrink-0 text-xs font-medium",
            msg.status === "running"
              ? "animate-thinking-shimmer bg-linear-to-r from-muted-foreground/40 via-foreground to-muted-foreground/40 bg-size-[200%_100%] bg-clip-text text-transparent"
              : msg.status === "error"
                ? "text-destructive/70"
                : DISCLOSURE_LABEL_DONE
          )}
        >
          {toolLabel}
        </span>

        {skillName ? (
          <span
            className={cn(
              "flex min-w-0 flex-1 items-center gap-1 text-xs",
              DISCLOSURE_DIM
            )}
          >
            <ContainerIcon className="h-3 w-3 shrink-0 opacity-60" />
            <span className="shrink-0 font-medium text-foreground/55">
              {skillName}
            </span>
            {skill?.description && (
              <>
                <span className="shrink-0 opacity-40">·</span>
                <span className="truncate opacity-80">{skill.description}</span>
              </>
            )}
          </span>
        ) : memory ? (
          memory.summary && (
            <span
              className={cn("min-w-0 flex-1 truncate text-xs", DISCLOSURE_DIM)}
            >
              {memory.summary}
            </span>
          )
        ) : lsp ? (
          lsp.summary && (
            <span
              className={cn("min-w-0 flex-1 truncate text-xs", DISCLOSURE_DIM)}
            >
              {lsp.summary}
            </span>
          )
        ) : displayFilePath ? (
          <span
            className={cn(
              "flex min-w-0 flex-1 items-center gap-1 text-xs",
              DISCLOSURE_DIM
            )}
          >
            <FileIcon
              filename={displayFilePath}
              className="h-3 w-3 shrink-0 opacity-60"
            />
            <span className="truncate">{fileBasename(displayFilePath)}</span>
          </span>
        ) : summary ? (
          <span
            className={cn(
              "min-w-0 flex-1 truncate",
              DISCLOSURE_DIM,
              normalizedToolName === "bash" ? "font-mono text-2xs" : "text-xs"
            )}
          >
            {summary}
          </span>
        ) : null}

        {readLineRange && (
          <span className="shrink-0 font-mono text-2xs text-muted-foreground/40 tabular-nums">
            {readLineRange}
          </span>
        )}

        {editCounts && (editCounts.added > 0 || editCounts.removed > 0) && (
          <span className="flex shrink-0 items-baseline gap-0.5 font-mono text-2xs tabular-nums">
            {editCounts.added > 0 && (
              <span className="text-green-600 dark:text-green-400">
                +<RollingTimerText text={String(editCounts.added)} />
              </span>
            )}
            {editCounts.removed > 0 && (
              <span className="text-red-500 dark:text-red-400">
                -<RollingTimerText text={String(editCounts.removed)} />
              </span>
            )}
          </span>
        )}

        {writeLineCount !== null && writeLineCount > 0 && (
          <span className="flex shrink-0 items-baseline font-mono text-2xs tabular-nums">
            <span className="text-green-600 dark:text-green-400">
              +<RollingTimerText text={String(writeLineCount)} />
            </span>
          </span>
        )}

        {memory?.headerItem && (
          <span className="flex shrink-0 items-center gap-1">
            {memory.headerItem.pinned && (
              <PinIcon className="h-3 w-3 text-amber-500/70" />
            )}
            {memory.headerItem.kind !== "fact" && (
              <MemoryChip>{memory.headerItem.kind}</MemoryChip>
            )}
            <MemoryChip>{memory.headerItem.scope}</MemoryChip>
          </span>
        )}

        {hasBody && <DisclosureChevron expanded={expanded} revealOnHover />}
      </button>

      {/* Collapsible content */}
      <CollapsibleBody open={expanded && hasBody}>
        <div className="group/copy relative mt-1.5 overflow-hidden rounded-lg border border-border/50 bg-muted/20 shadow-xs">
          <button
            type="button"
            onClick={handleCopy}
            className={cn(
              "absolute top-1.5 right-1.5 z-10 shrink-0 rounded-md border border-border/50 bg-background/80 p-1 text-muted-foreground/50 opacity-0 shadow-xs backdrop-blur-sm transition-all group-hover/copy:opacity-100 hover:text-foreground",
              copied && "border-emerald-500/40 text-emerald-500 opacity-100"
            )}
            aria-label="Copy result"
          >
            {copied ? (
              <CheckIcon className="h-3 w-3" />
            ) : (
              <CopyIcon className="h-3 w-3" />
            )}
          </button>

          {/* Bash: trigger row truncates the command, so repeat it in full */}
          {normalizedToolName === "bash" && summary && (
            <div className="flex items-start justify-between gap-2 border-b border-border/40 bg-muted/30 px-3 py-2 pr-9">
              <div className="flex min-w-0 flex-1 items-start gap-2">
                <span className="mt-px font-mono text-2xs font-bold text-primary/60 select-none">
                  $
                </span>
                <span className="flex-1 font-mono text-2xs break-all whitespace-pre-wrap text-foreground/70">
                  {summary}
                </span>
              </div>
              {msg.status === "done" && resultText && (
                <span className="shrink-0 self-center text-2xs text-muted-foreground/40 tabular-nums">
                  {resultText.split("\n").length} lines
                </span>
              )}
            </div>
          )}

          {/* Content */}
          <div className="px-3 py-2">
            {/* Write tool: show content from args immediately — available at tool_start */}
            {isWrite && writeArgs && msg.status !== "error" && (
              <WriteView
                content={writeArgs.content}
                filePath={writeArgs.path}
                live={msg.status === "running"}
              />
            )}

            {/* Running placeholder — always for edit (no partial results), only
                  when there is no content yet for read/other tools */}
            {msg.status === "running" &&
              !isWrite &&
              resultImages.length === 0 &&
              (isEdit || !resultText) && (
                <span className="animate-thinking-shimmer bg-linear-to-r from-muted-foreground/30 via-foreground/80 to-muted-foreground/30 bg-size-[200%_100%] bg-clip-text text-transparent">
                  {isEdit
                    ? "Editing"
                    : memory
                      ? memory.label
                      : skillName
                        ? "Loading skill"
                        : lsp
                          ? "Checking diagnostics"
                          : isRead
                            ? "Reading"
                            : "Running"}
                </span>
              )}

            {/* Running: partial result for read / other tools */}
            {msg.status === "running" &&
              !isWrite &&
              (resultText || resultImages.length > 0) && (
                <div className="flex flex-col gap-2">
                  {skill && <SkillView skill={skill} />}
                  {!skill && isRead && readFilePath && resultText && (
                    <ReadView
                      text={resultText}
                      filePath={readFilePath}
                      live={true}
                    />
                  )}
                  {!isRead && !isMemory && !isLsp && resultText && (
                    <LivePre text={resultText} live={true} />
                  )}
                  {lsp && (
                    <LspView lsp={lsp} rawText={resultText} live={true} />
                  )}
                  {!isRead && resultImages.length > 0 && (
                    <ImageView images={resultImages} />
                  )}
                </div>
              )}

            {/* Done state */}
            {msg.status === "done" && (
              <>
                {/* Only mount the (heavy) Monaco diff while expanded. The
                      collapsible wrapper keeps children in the DOM, so without
                      this gate every collapsed edit would carry a live editor
                      whose automatic layout thrashes on window resize. */}
                {isEdit && diff !== null && expanded && (
                  <DiffView
                    diff={diff}
                    filePath={(msg.args as { path?: string }).path}
                    showHeader
                  />
                )}

                {skill && <SkillView skill={skill} />}
                {!skill && isRead && readFilePath && resultText && (
                  <ReadView
                    text={resultText}
                    filePath={readFilePath}
                    live={false}
                  />
                )}

                {/* Memory: structured cards; fall back to the raw text only
                    when the result isn't the expected payload shape. */}
                {memory &&
                  (memory.memories.length > 0 || memory.message !== null ? (
                    <MemoryView
                      memories={memory.memories}
                      message={memory.message}
                      failed={memory.failed}
                    />
                  ) : !memory.parsed && resultText ? (
                    <LivePre text={resultText} live={false} />
                  ) : null)}

                {lsp && <LspView lsp={lsp} rawText={resultText} live={false} />}

                {!isEdit &&
                  !isRead &&
                  !isWrite &&
                  !isMemory &&
                  !isLsp &&
                  resultText && <LivePre text={resultText} live={false} />}

                {/* Screenshots / images returned by the tool (e.g. browser or
                    screenshot tools). Shown after any text, with a small gap. */}
                {!isEdit && !isRead && !isWrite && resultImages.length > 0 && (
                  <div className={cn(resultText && "mt-2")}>
                    <ImageView images={resultImages} />
                  </div>
                )}
              </>
            )}

            {/* Error state */}
            {msg.status === "error" && (
              <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2">
                <AlertCircleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive/70" />
                <pre className="flex-1 overflow-auto text-xs break-all whitespace-pre-wrap text-destructive/80">
                  {resultText ?? "Tool execution failed"}
                </pre>
              </div>
            )}
          </div>
        </div>
      </CollapsibleBody>
    </div>
  )
})
