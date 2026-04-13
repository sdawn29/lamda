import { lazy, memo, Suspense, useMemo, useState } from "react"
import {
  BookOpenTextIcon,
  ChevronRightIcon,
  FileEditIcon,
  FilePlusIcon,
  FolderSearchIcon,
  ListTreeIcon,
  Loader2Icon,
  SearchIcon,
  TerminalSquareIcon,
  WrenchIcon,
} from "lucide-react"
import { jellybeansdark, jellybeanslight } from "@/shared/lib/syntax-theme"

import { cn } from "@/shared/lib/utils"
import { LivePre } from "./live-pre"
import { DiffView, detectLanguage } from "@/features/git"
import { useTheme } from "@/shared/components/theme-provider"
import type { ToolMessage } from "../types"

const PrismCode = lazy(() => import("./prism-code"))

function ToolGlyph({ toolName }: { toolName: string }) {
  const cls = "h-3 w-3 text-muted-foreground/40"
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

// ── Generic result ─────────────────────────────────────────────────────────────

function getResultText(msg: ToolMessage): string | null {
  if (msg.result === undefined) return null
  if (typeof msg.result === "string") return msg.result
  if (
    typeof msg.result === "object" &&
    msg.result !== null &&
    Array.isArray((msg.result as Record<string, unknown>).content)
  ) {
    const parts = (msg.result as { content: { type: string; text?: string }[] })
      .content
    const text = parts
      .filter((p) => p.type === "text" && typeof p.text === "string")
      .map((p) => p.text)
      .join("")
    if (text) return text
  }
  return JSON.stringify(msg.result, null, 2)
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
}: {
  msg: ToolMessage
}) {
  const normalizedToolName = msg.toolName.toLowerCase()
  const isEdit = normalizedToolName === "edit" && isEditArgs(msg.args)
  const diff = isEdit ? getEditDiff(msg.result) : null
  const isRead = isReadTool(normalizedToolName, msg.args)
  const readFilePath = isRead ? getReadFilePath(msg.args) : null

  const defaultExpanded =
    msg.status === "running" ||
    (isEdit && diff !== null) ||
    msg.status === "error"
  const [userToggled, setUserToggled] = useState(false)
  const [manualExpanded, setManualExpanded] = useState(false)
  const expanded = userToggled ? manualExpanded : defaultExpanded

  function toggle() {
    setUserToggled(true)
    setManualExpanded((e) => !e)
  }

  const resultText = useMemo(() => getResultText(msg), [msg])
  const summary = argsSummary(msg.args)

  return (
    <div className="w-full max-w-2xl animate-in text-xs duration-150 fade-in-0 slide-in-from-bottom-1">
      {/* Header */}
      <button
        className="group flex w-full items-center gap-1.5 py-0.5 text-left transition-colors"
        onClick={toggle}
      >
        <ChevronRightIcon
          className={cn(
            "h-3 w-3 shrink-0 text-muted-foreground/30 transition-transform group-hover:text-muted-foreground/50",
            expanded && "rotate-90"
          )}
        />
        <ToolGlyph toolName={msg.toolName} />
        <span
          className={cn(
            "shrink-0 leading-none text-muted-foreground/60 group-hover:text-muted-foreground/80",
            msg.status === "error" && "text-destructive/60"
          )}
        >
          {msg.toolName}
        </span>
        {summary && (
          <span className="min-w-0 flex-1 truncate leading-none text-muted-foreground/35 group-hover:text-muted-foreground/55">
            {summary}
          </span>
        )}
        {msg.status === "running" && (
          <Loader2Icon className="h-3 w-3 shrink-0 animate-spin text-muted-foreground/40" />
        )}
        {msg.status === "error" && (
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive/60" />
        )}
      </button>

      {/* Body */}
      {expanded && (
        <div className="mt-0.5 ml-1.5 animate-in border-l border-border/30 pl-4 duration-200 fade-in-0">
          {/* Edit: show pre-computed diff from SDK */}
          {isEdit && diff !== null && (
            <DiffView
              diff={diff}
              filePath={(msg.args as { path?: string }).path}
            />
          )}

          {/* Edit running — no diff yet */}
          {isEdit && diff === null && msg.status === "running" && (
            <span className="text-muted-foreground/40">Editing…</span>
          )}

          {/* Read tool: syntax-highlighted file content */}
          {isRead && readFilePath && resultText && msg.status !== "error" && (
            <ReadView
              text={resultText}
              filePath={readFilePath}
              live={msg.status === "running"}
            />
          )}

          {isRead && !resultText && msg.status === "running" && (
            <span className="text-muted-foreground/40">Reading…</span>
          )}

          {/* Non-edit, non-read tools or error fallback */}
          {!isEdit &&
            !isRead &&
            resultText &&
            (msg.status === "error" ? (
              <pre className="max-h-48 overflow-auto break-all whitespace-pre-wrap text-destructive/70">
                {resultText}
              </pre>
            ) : (
              <LivePre text={resultText} live={msg.status === "running"} />
            ))}

          {!isEdit && !isRead && !resultText && msg.status === "running" && (
            <span className="text-muted-foreground/40">Running…</span>
          )}

          {/* Edit / read error */}
          {(isEdit || isRead) && msg.status === "error" && resultText && (
            <pre className="max-h-48 overflow-auto break-all whitespace-pre-wrap text-destructive/70">
              {resultText}
            </pre>
          )}
        </div>
      )}
    </div>
  )
})
