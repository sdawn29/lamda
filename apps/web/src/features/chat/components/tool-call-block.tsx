import { lazy, memo, Suspense, useEffect, useRef, useState } from "react"
import {
  AlertCircleIcon,
  CheckIcon,
  ChevronRightIcon,
  CircleDotIcon,
  CopyIcon,
  ListTodoIcon,
} from "lucide-react"
import { FileIcon } from "@/shared/ui/file-icon"
import { jellybeansdark, jellybeanslight } from "@/shared/lib/syntax-theme"

import { cn } from "@/shared/lib/utils"
import { LivePre } from "./live-pre"
import { DiffView, detectLanguage, parseDiffCounts } from "@/features/git"
import { useTheme } from "@/shared/components/theme-provider"
import { RollingTimerText } from "./working-block"
import { WriteView } from "./write-view"
import { PlanSavedCard } from "./plan-saved-card"
import type { ToolMessage } from "../types"

const PrismCode = lazy(() => import("./prism-code"))

const PLAN_DIR_PREFIX = ".agents/plans/"



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
 * Detect a plan-mode artifact write (a write into `.agents/plans/*.md`).
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

function fileBasename(filePath: string): string {
  return filePath.split("/").pop() ?? filePath
}

function argsSummary(args: unknown, rootPath?: string): string {
  if (typeof args !== "object" || args === null) return ""
  const a = args as Record<string, unknown>
  if (typeof a.command === "string") return a.command
  if (typeof a.path === "string") return toRelativePath(a.path, rootPath)
  if (typeof a.file_path === "string") return toRelativePath(a.file_path, rootPath)
  if (typeof a.pattern === "string") return a.pattern
  const first = Object.values(a)[0]
  return typeof first === "string" ? first : ""
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
  const { theme } = useTheme()
  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches)
  const language = detectLanguage(filePath) ?? "text"

  return (
    <div className="max-h-64 overflow-auto rounded border border-border/30 text-xs text-muted-foreground/60">
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
          style={isDark ? jellybeansdark : jellybeanslight}
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
  const isWrite =
    (normalizedToolName === "write" || normalizedToolName === "plan_write") &&
    isWriteArgs(msg.args)
  const writeArgs = isWrite ? (msg.args as WriteArgs) : null
  const filePath = (isEdit || isWrite) ? getReadFilePath(msg.args) : null

  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
    }
  }, [])

  // Todo tool: render as a tiny inline pill — the full state lives in TodoPanel
  // above the input, so we don't duplicate the card here.
  if (normalizedToolName === "todo") {
    const todoOp = (typeof msg.args === "object" && msg.args !== null)
      ? (msg.args as Record<string, unknown>).operation as string | undefined
      : undefined
    return (
      <div
        className={cn("flex items-center gap-1.5 text-xs", isNew && "animate-chat-message-in")}
        style={isNew && entryDelayMs > 0 ? { animationDelay: `${entryDelayMs}ms` } : undefined}
      >
        {msg.status === "running" ? (
          <CircleDotIcon className="h-3 w-3 shrink-0 animate-pulse text-blue-500/60" />
        ) : msg.status === "error" ? (
          <AlertCircleIcon className="h-3 w-3 shrink-0 text-destructive/60" />
        ) : (
          <ListTodoIcon className="h-3 w-3 shrink-0 text-muted-foreground/30" />
        )}
        <span
          className={cn(
            msg.status === "running"
              ? "animate-thinking-shimmer bg-linear-to-r from-muted-foreground/40 via-foreground/70 to-muted-foreground/40 bg-size-[200%_100%] bg-clip-text text-transparent"
              : msg.status === "error"
                ? "text-destructive/60"
                : "text-muted-foreground/35",
          )}
        >
          {msg.status === "running"
            ? todoOp === "create" ? "Creating tasks…"
            : todoOp === "update" ? "Updating task…"
            : todoOp === "delete" ? "Removing task…"
            : "Loading tasks…"
          : msg.status === "error"
            ? "todo failed"
            : todoOp === "create" ? "Tasks created"
            : todoOp === "update" ? "Task updated"
            : todoOp === "delete" ? "Task removed"
            : "Tasks"}
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
        className="flex items-center gap-1.5 text-left"
        onClick={toggle}
        aria-expanded={expanded}
      >
        <span className={cn(
          "text-sm font-medium",
          msg.status === "running"
            ? "animate-thinking-shimmer bg-linear-to-r from-muted-foreground/40 via-foreground to-muted-foreground/40 bg-size-[200%_100%] bg-clip-text text-transparent"
            : msg.status === "error"
              ? "text-destructive/70"
              : "text-muted-foreground/45"
        )}>
          {msg.toolName}
        </span>

        {filePath ? (
          <span className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground/35">
            <FileIcon filename={filePath} className="h-3.5 w-3.5 shrink-0 opacity-50" />
            <span className="truncate">{fileBasename(filePath)}</span>
          </span>
        ) : summary ? (
          <span className="truncate text-sm text-muted-foreground/35">{summary}</span>
        ) : null}

        {editCounts && (editCounts.added > 0 || editCounts.removed > 0) && (
          <span className="flex shrink-0 items-baseline gap-0.5 font-mono text-xs tabular-nums">
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
          <span className="flex shrink-0 items-baseline font-mono text-xs tabular-nums">
            <span className="text-green-600 dark:text-green-400">
              +<RollingTimerText text={String(writeLineCount)} />
            </span>
          </span>
        )}

        <ChevronRightIcon
          className={cn(
            "h-3 w-3 shrink-0 text-muted-foreground/30 transition-transform duration-200",
            expanded && "rotate-90"
          )}
        />
      </button>

      {/* Collapsible content */}
      <div
        className={cn(
          "grid transition-all duration-300 ease-in-out",
          expanded && hasBody ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          <div className="group/copy mt-2 overflow-hidden rounded-lg border border-border/40 bg-black/5 dark:bg-white/[0.03]">
            {/* Header: summary + copy */}
            <div className="flex items-start gap-2 border-b border-border/30 px-3 py-1.5">
              {normalizedToolName === "bash" ? (
                <span className="mt-px font-mono text-[11px] font-bold text-foreground/60">$</span>
              ) : (isEdit || isWrite) && filePath ? (
                <FileIcon filename={filePath} className="mt-px h-3.5 w-3.5 shrink-0 opacity-50" />
              ) : null}
              <span className={cn(
                "flex-1 font-mono text-[11px] text-foreground/60",
                normalizedToolName === "bash" ? "break-all whitespace-pre-wrap" : "truncate"
              )}>
                {summary || msg.toolName}
              </span>
              <button
                type="button"
                onClick={handleCopy}
                className={cn(
                  "shrink-0 rounded p-1 text-muted-foreground/40 opacity-0 transition-colors group-hover/copy:opacity-100 hover:bg-muted hover:text-muted-foreground",
                  copied && "text-emerald-500"
                )}
                aria-label="Copy result"
              >
                {copied ? (
                  <CheckIcon className="h-3 w-3" />
                ) : (
                  <CopyIcon className="h-3 w-3" />
                )}
              </button>
            </div>

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
                  {isEdit && diff !== null && (
                    <DiffView
                      diff={diff}
                      filePath={(msg.args as { path?: string }).path}
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
                <div className="flex items-start gap-2 rounded border border-destructive/30 bg-destructive/10 px-3 py-2">
                  <AlertCircleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive/80" />
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
