import { lazy, memo, Suspense, useEffect, useRef, useState } from "react"
import {
  AlertCircleIcon,
  ArrowRightIcon,
  CheckIcon,
  ChevronRightIcon,
  CircleDotIcon,
  CopyIcon,
  FilePenLineIcon,
  FilePlus2Icon,
  FileTextIcon,
  GlobeIcon,
  ListTodoIcon,
  MessageCircleQuestionIcon,
  SearchIcon,
  SquareTerminalIcon,
  WrenchIcon,
  ZapIcon,
} from "lucide-react"
import { FileIcon } from "@/shared/ui/file-icon"

import { cn } from "@/shared/lib/utils"
import { LivePre } from "./live-pre"
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

function getEditDiff(result: unknown): string | null {
  if (typeof result !== "object" || result === null) return null
  const details = (result as Record<string, unknown>).details
  if (typeof details !== "object" || details === null) return null
  const diff = (details as Record<string, unknown>).diff
  return typeof diff === "string" ? diff : null
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
  rootPath: string | undefined,
): { relativePath: string; absolutePath: string } | null {
  if (!rawPath.toLowerCase().endsWith(".md")) return null
  const root = rootPath ? (rootPath.endsWith("/") ? rootPath : rootPath + "/") : null
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
    if (text) return text
  }
  return JSON.stringify(resultSource, null, 2)
}

function toRelativePath(p: string, rootPath?: string): string {
  if (!rootPath) return p
  const root = rootPath.endsWith("/") ? rootPath : rootPath + "/"
  return p.startsWith(root) ? p.slice(root.length) : p
}

export function fileBasename(filePath: string): string {
  return filePath.split("/").pop() ?? filePath
}

/** Small leading glyph that identifies the tool kind at a glance. */
export function ToolGlyph({
  toolName,
  className,
}: {
  toolName: string
  className?: string
}) {
  const name = toolName.toLowerCase()
  const Icon =
    name === "bash" || name.includes("terminal") || name.includes("command")
      ? SquareTerminalIcon
      : name.includes("edit")
        ? FilePenLineIcon
        : name === "write" || name === "plan_write"
          ? FilePlus2Icon
          : name === "read" || name === "plan_read"
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
  if (typeof a.file_path === "string") return toRelativePath(a.file_path, rootPath)
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
      q && typeof q === "object" && typeof (q as Record<string, unknown>).question === "string"
        ? ((q as Record<string, unknown>).question as string).trim()
        : ""
    )
    .filter(Boolean)
}

/** Returned to the agent when the turn is aborted before the user answers. */
const QUESTION_DISMISSED = "[The user dismissed the question without answering.]"

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
  return (name === "read" || name === "plan_read") && getReadFilePath(args) !== null
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

/**
 * True when a tool message is a Read of a skill's `SKILL.md`. Used by the
 * working block to keep skill loads out of "Read · N files" run groups —
 * they render as a distinct Skill row instead.
 */
export function isSkillRead(msg: ToolMessage): boolean {
  const name = msg.toolName.toLowerCase()
  if (name !== "read" && name !== "plan_read") return false
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
  id: string,
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
      return { label: goal ? `Creating "${goal}"…` : "Creating tasks…", tone: "active" }
    }
    const count = `${n} task${n === 1 ? "" : "s"}`
    return { label: goal ? `Created "${goal}" · ${count}` : "Tasks created", tone: "done" }
  }

  if (op === "update") {
    const id = typeof a.id === "string" ? a.id : ""
    const status = typeof a.status === "string" ? a.status : undefined
    const task = findTodoTask(parseTodoGoals(msg), id)
    const content =
      task?.content ?? (typeof a.content === "string" ? a.content.trim() : null)

    if (status === "completed") {
      if (content) return { label: `Completed "${content}"`, tone: "done" }
      return { label: running ? "Completing task…" : "Task completed", tone: "done" }
    }
    if (status === "in_progress") {
      if (content) return { label: `Working on "${content}"`, tone: running ? "active" : "done" }
      return { label: running ? "Starting task…" : "Task in progress", tone: "active" }
    }
    if (content) return { label: `Updated: ${content}`, tone: "done" }
    return { label: running ? "Updating task…" : "Task updated", tone: "done" }
  }

  if (op === "delete") {
    const id = typeof a.id === "string" ? a.id : ""
    const content = findTodoTask(parseTodoGoals(msg), id)?.content
    if (content) return { label: `Removed: ${content}`, tone: "done" }
    return { label: running ? "Removing task…" : "Task removed", tone: "done" }
  }

  return { label: running ? "Loading tasks…" : "Tasks", tone: "done" }
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
  const isRead = isReadTool(normalizedToolName, msg.args)
  const readFilePath = isRead ? getReadFilePath(msg.args) : null
  const readLineRange = isRead ? getReadLineRange(msg.args) : null
  const skillName = isRead ? getReadSkillName(readFilePath) : null
  const isWrite =
    (normalizedToolName === "write" || normalizedToolName === "plan_write") &&
    isWriteArgs(msg.args)
  const writeArgs = isWrite ? (msg.args as WriteArgs) : null
  const filePath = (isEdit || isWrite) ? getReadFilePath(msg.args) : null
  // Reads get the same file-icon + basename row treatment as edits/writes
  const displayFilePath = filePath ?? (skillName ? null : readFilePath)

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
          ? "Waiting for your answer…"
          : prompts.length === 1
            ? prompts[0]
            : `Asked you ${prompts.length} questions`
      return (
        <div {...containerProps} className={cn("flex items-center gap-1.5", containerProps.className)}>
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
          <span className="font-medium text-muted-foreground/45">{headerLabel}</span>
        </div>
        {!dismissed && prompts.length > 0 && (
          <div className="mt-1.5 ml-[1.125rem] flex flex-col gap-1.5">
            {prompts.map((prompt, i) => (
              <div key={i} className="flex flex-col gap-0.5">
                <span className="text-xs text-muted-foreground/70">{prompt}</span>
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
        className={cn("flex items-center gap-1.5 text-xs", isNew && "animate-chat-message-in")}
        style={isNew && entryDelayMs > 0 ? { animationDelay: `${entryDelayMs}ms` } : undefined}
      >
        {msg.status === "error" ? (
          <AlertCircleIcon className="h-3 w-3 shrink-0 text-destructive/60" />
        ) : msg.status === "running" ? (
          <CircleDotIcon className="h-3 w-3 shrink-0 animate-pulse text-blue-500/60" />
        ) : isCompleted ? (
          <CheckIcon className="h-3 w-3 shrink-0 text-muted-foreground/45" strokeWidth={2.5} />
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
                : "text-muted-foreground/45",
          )}
        >
          {todo.label}
        </span>
      </div>
    )
  }

  // Plan-mode writes get a custom card with Review + Implement CTAs.
  // Must come after the hooks above to keep call order stable.
  const planMeta = isWrite && writeArgs ? planWriteMeta(writeArgs.path, rootPath) : null
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
  const summary = argsSummary(msg.args, rootPath)

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
  const showOtherContent =
    !isEdit &&
    !isRead &&
    !isWrite &&
    (resultText !== null || msg.status === "running" || msg.status === "error")

  const hasBody =
    showEditContent || showReadContent || showWriteContent || showOtherContent

  return (
    <div
      className={cn(
        "w-full text-xs",
        isNew && "animate-chat-message-in"
      )}
      style={
        isNew && entryDelayMs > 0
          ? { animationDelay: `${entryDelayMs}ms` }
          : undefined
      }
    >
      {/* Trigger row — text accordion style */}
      <button
        type="button"
        className="group/row -mx-1.5 flex w-fit max-w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 text-left transition-colors hover:bg-muted/40"
        onClick={toggle}
        aria-expanded={hasBody ? expanded : undefined}
      >
        {skillName ? (
          <span className="flex shrink-0 items-center gap-1 rounded-md bg-purple-500/10 px-1.5 py-0.5 text-2xs font-medium text-purple-600 dark:text-purple-400">
            <ZapIcon className="h-3 w-3 shrink-0" />
            <span className="leading-none">Skill</span>
          </span>
        ) : (
          <ToolGlyph
            toolName={msg.toolName}
            className={cn(
              "h-3 w-3 shrink-0",
              msg.status === "running"
                ? "animate-pulse text-foreground/50"
                : msg.status === "error"
                  ? "text-destructive/60"
                  : "text-muted-foreground/40"
            )}
          />
        )}

        <span className={cn(
          "text-xs font-medium",
          skillName ? "min-w-0 truncate" : "shrink-0",
          msg.status === "running"
            ? "animate-thinking-shimmer bg-linear-to-r from-muted-foreground/40 via-foreground to-muted-foreground/40 bg-size-[200%_100%] bg-clip-text text-transparent"
            : msg.status === "error"
              ? "text-destructive/70"
              : skillName
                ? "text-foreground/70"
                : "text-muted-foreground/55"
        )}>
          {skillName ?? msg.toolName}
        </span>

        {skillName ? null : displayFilePath ? (
          <span className="flex min-w-0 flex-1 items-center gap-1 text-xs text-muted-foreground/40">
            <FileIcon filename={displayFilePath} className="h-3 w-3 shrink-0 opacity-60" />
            <span className="truncate">{fileBasename(displayFilePath)}</span>
          </span>
        ) : summary ? (
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-muted-foreground/40",
              normalizedToolName === "bash" ? "font-mono text-2xs" : "text-xs"
            )}
          >
            {summary}
          </span>
        ) : null}

        {readLineRange && (
          <span className="shrink-0 font-mono text-2xs tabular-nums text-muted-foreground/40">
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

        {hasBody && (
          <ChevronRightIcon
            className={cn(
              "h-3 w-3 shrink-0 text-muted-foreground/30 transition-all duration-200",
              expanded
                ? "rotate-90 opacity-100"
                : "opacity-0 group-hover/row:opacity-100"
            )}
          />
        )}
      </button>

      {/* Collapsible content */}
      <div
        className={cn(
          "grid transition-all duration-300 ease-in-out",
          expanded && hasBody ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
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
                  <span className="mt-px font-mono text-2xs font-bold text-primary/60 select-none">$</span>
                  <span className="flex-1 font-mono text-2xs break-all whitespace-pre-wrap text-foreground/70">
                    {summary}
                  </span>
                </div>
                {msg.status === "done" && resultText && (
                  <span className="shrink-0 self-center tabular-nums text-2xs text-muted-foreground/40">
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
                (isEdit || !resultText) && (
                  <span className="animate-thinking-shimmer bg-linear-to-r from-muted-foreground/30 via-foreground/80 to-muted-foreground/30 bg-size-[200%_100%] bg-clip-text text-transparent">
                    {isEdit ? "Editing…" : isRead ? "Reading…" : "Running…"}
                  </span>
                )}

              {/* Running: partial result for read / other tools */}
              {msg.status === "running" && !isWrite && resultText && (
                <>
                  {isRead && readFilePath && (
                    <ReadView
                      text={resultText}
                      filePath={readFilePath}
                      live={true}
                    />
                  )}
                  {!isRead && <LivePre text={resultText} live={true} />}
                </>
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

                  {isRead && readFilePath && resultText && (
                    <ReadView
                      text={resultText}
                      filePath={readFilePath}
                      live={false}
                    />
                  )}

                  {!isEdit && !isRead && !isWrite && resultText && (
                    <LivePre text={resultText} live={false} />
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
        </div>
      </div>
    </div>
  )
})
