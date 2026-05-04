import { lazy, memo, Suspense, useEffect, useRef, useState } from "react"
import {
  AlertCircleIcon,
  BookOpenTextIcon,
  CheckIcon,
  ChevronRightIcon,
  CopyIcon,
  FileEditIcon,
  FilePlusIcon,
  FolderSearchIcon,
  ListTreeIcon,
  Loader2Icon,
  SearchIcon,
  TerminalSquareIcon,
  WrenchIcon,
  XIcon,
} from "lucide-react"
import { jellybeansdark, jellybeanslight } from "@/shared/lib/syntax-theme"

import { cn } from "@/shared/lib/utils"
import { formatDuration } from "@/shared/lib/formatters"
import { LivePre } from "./live-pre"
import { DiffView, detectLanguage } from "@/features/git"
import { useTheme } from "@/shared/components/theme-provider"
import type { ToolMessage } from "../types"

const PrismCode = lazy(() => import("./prism-code"))

// ── Tool glyph icons ────────────────────────────────────────────────────────────

function ToolGlyph({ toolName }: { toolName: string }) {
  const cls = "h-3 w-3 shrink-0"
  switch (toolName.toLowerCase()) {
    case "bash":
      return <TerminalSquareIcon className={cls} />
    case "edit":
      return <FileEditIcon className={cls} />
    case "find":
      return <FolderSearchIcon className={cls} />
    case "grep":
      return <SearchIcon className={cls} />
    case "ls":
      return <ListTreeIcon className={cls} />
    case "read":
      return <BookOpenTextIcon className={cls} />
    case "write":
      return <FilePlusIcon className={cls} />
    default:
      return <WrenchIcon className={cls} />
  }
}

// ── Status badge ────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ToolMessage["status"] }) {
  if (status === "running") {
    return (
      <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
        <Loader2Icon className="h-2.5 w-2.5 animate-spin" />
        Running
      </span>
    )
  }
  if (status === "error") {
    return (
      <span className="flex items-center gap-1 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
        <XIcon className="h-2.5 w-2.5" />
        Error
      </span>
    )
  }
  return null
}

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
    const parts = (resultSource as { content: { type: string; text?: string }[] })
      .content
    const text = parts
      .filter((p) => p.type === "text" && typeof p.text === "string")
      .map((p) => p.text)
      .join("")
    if (text) return text
  }
  return JSON.stringify(resultSource, null, 2)
}

function argsSummary(args: unknown): string {
  if (typeof args !== "object" || args === null) return ""
  const a = args as Record<string, unknown>
  if (typeof a.command === "string") return a.command
  if (typeof a.path === "string") return a.path
  if (typeof a.file_path === "string") return a.file_path
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
  return toolName.toLowerCase() === "read" && getReadFilePath(args) !== null
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
    <div className="overflow-auto rounded border border-border/30 text-xs text-muted-foreground/60 max-h-64">
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

// ── WriteView ─────────────────────────────────────────────────────────────────

function WriteView({
  content,
  filePath,
  live,
}: {
  content: string
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
    <div className="overflow-auto rounded border border-border/30 text-xs max-h-72">
      <Suspense
        fallback={
          <pre className="overflow-auto px-3 py-2 text-xs text-muted-foreground/60">
            {content}
          </pre>
        }
      >
        <PrismCode
          code={content}
          language={language}
          style={isDark ? jellybeansdark : jellybeanslight}
          fontSize="0.75rem"
          showLineNumbers={true}
          opacity={live ? 0.6 : 0.85}
        />
      </Suspense>
    </div>
  )
}

// ── ToolCallBlock ──────────────────────────────────────────────────────────────

export const ToolCallBlock = memo(function ToolCallBlock({
  msg,
}: {
  msg: ToolMessage
}) {
  const normalizedToolName = msg.toolName.toLowerCase()
  const isEdit = normalizedToolName === "edit" && isEditArgs(msg.args)
  const diff = isEdit ? getEditDiff(msg.result) : null
  const isRead = isReadTool(normalizedToolName, msg.args)
  const readFilePath = isRead ? getReadFilePath(msg.args) : null
  const isWrite = normalizedToolName === "write" && isWriteArgs(msg.args)
  const writeArgs = isWrite ? (msg.args as WriteArgs) : null

  // Edit and write tools auto-expand; everything else starts collapsed
  const [expanded, setExpanded] = useState(isEdit || isWrite)
  const [copied, setCopied] = useState(false)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
    }
  }, [])

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
  const summary = argsSummary(msg.args)

  // Body is shown when there is something to render at any status.
  // "running" and "error" must always open the body so their respective
  // placeholder / error block is reachable inside the collapsed grid.
  const showEditContent = isEdit && (msg.status === "running" || diff !== null || msg.status === "error")
  const showReadContent = isRead && (resultText !== null || msg.status === "running" || msg.status === "error")
  // Write: content is in args from tool_start, always available
  const showWriteContent = isWrite && writeArgs !== null
  const showOtherContent = !isEdit && !isRead && !isWrite && (resultText !== null || msg.status === "running" || msg.status === "error")

  const hasBody = showEditContent || showReadContent || showWriteContent || showOtherContent

  return (
    <div
      className={cn(
        "group w-full animate-in cursor-pointer rounded-lg border border-border/50 text-xs duration-150 fade-in-0 slide-in-from-bottom-1",
        "transition-all duration-150 hover:border-border/80 hover:bg-muted/20",
        expanded && "bg-muted/15"
      )}
      onClick={toggle}
      role="button"
      aria-expanded={expanded}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          setExpanded((prev) => !prev)
        }
      }}
    >
      {/* Card header row */}
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        {/* Tool badge — icon + name pill */}
        <span className="flex shrink-0 items-center gap-1.5 rounded bg-muted/70 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
          <ToolGlyph toolName={msg.toolName} />
          <span className="leading-none">{msg.toolName}</span>
        </span>

        {/* Summary — fills available space, truncated */}
        {summary && (
          <span className="min-w-0 flex-1 truncate text-muted-foreground/55 group-hover:text-muted-foreground/75">
            {summary}
          </span>
        )}

        {/* Right side — status + chevron */}
        <span className="flex shrink-0 items-center gap-1.5">
          <StatusBadge status={msg.status} />
          {msg.duration != null && msg.status !== "running" && (
            <span className="text-muted-foreground/30 tabular-nums">
              {formatDuration(msg.duration)}
            </span>
          )}
          <ChevronRightIcon
            className={cn(
              "h-3 w-3 shrink-0 text-muted-foreground/30 transition-transform duration-200",
              expanded && "rotate-90"
            )}
          />
        </span>
      </div>

      {/* Collapsible content — inside the card */}
      <div
        className={cn(
          "grid transition-all duration-300 ease-in-out",
          expanded && hasBody ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          <div className="border-t border-border/30 px-3 py-2">

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
            {msg.status === "running" && !isWrite && (isEdit || !resultText) && (
              <span className="text-muted-foreground/40">
                {isEdit ? "Editing…" : isRead ? "Reading…" : "Running…"}
              </span>
            )}

            {/* Running: partial result for read / other tools */}
            {msg.status === "running" && !isWrite && resultText && (
              <>
                {isRead && readFilePath && (
                  <ReadView text={resultText} filePath={readFilePath} live={true} />
                )}
                {!isRead && (
                  <LivePre text={resultText} live={true} />
                )}
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
                  <ReadView text={resultText} filePath={readFilePath} live={false} />
                )}

                {!isEdit && !isRead && !isWrite && resultText && (
                  <div className="group/copy relative">
                    <LivePre text={resultText} live={false} />
                    <button
                      type="button"
                      onClick={handleCopy}
                      className={cn(
                        "absolute right-1.5 top-1.5 rounded p-1 text-muted-foreground/40 opacity-0 transition-colors hover:bg-muted hover:text-muted-foreground group-hover/copy:opacity-100",
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
                )}
              </>
            )}

            {/* Error state */}
            {msg.status === "error" && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2">
                <AlertCircleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive/80" />
                <pre className="flex-1 overflow-auto break-all whitespace-pre-wrap text-xs text-destructive/80">
                  {resultText ?? "Tool execution failed"}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
})
