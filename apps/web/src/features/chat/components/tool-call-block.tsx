import { lazy, memo, Suspense, useMemo, useState } from "react"
import {
  BookOpenTextIcon,
  ChevronDownIcon,
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
import { LivePre } from "./live-pre"
import { DiffView, detectLanguage } from "@/features/git"
import { useTheme } from "@/shared/components/theme-provider"
import type { ToolMessage } from "../types"

const PrismCode = lazy(() => import("./prism-code"))

function ToolGlyph({ toolName }: { toolName: string }) {
  switch (toolName.toLowerCase()) {
    case "bash":
      return (
        <TerminalSquareIcon className="h-3.5 w-3.5 text-muted-foreground" />
      )
    case "edit":
      return <FileEditIcon className="h-3.5 w-3.5 text-muted-foreground" />
    case "find":
      return <FolderSearchIcon className="h-3.5 w-3.5 text-muted-foreground" />
    case "grep":
      return <SearchIcon className="h-3.5 w-3.5 text-muted-foreground" />
    case "ls":
      return <ListTreeIcon className="h-3.5 w-3.5 text-muted-foreground" />
    case "read":
      return <BookOpenTextIcon className="h-3.5 w-3.5 text-muted-foreground" />
    case "write":
      return <FilePlusIcon className="h-3.5 w-3.5 text-muted-foreground" />
    default:
      return <WrenchIcon className="h-3.5 w-3.5 text-muted-foreground" />
  }
}

function getStatusLabel(status: ToolMessage["status"]): string {
  switch (status) {
    case "done":
      return "Done"
    case "error":
      return "Failed"
    default:
      return "Running"
  }
}

function getStatusClasses(status: ToolMessage["status"]): string {
  switch (status) {
    case "error":
      return "text-destructive"
    default:
      return "text-muted-foreground"
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
    <div className="max-h-64 overflow-auto rounded-md border border-border/60 text-xs">
      <Suspense
        fallback={
          <pre className="overflow-auto px-3 py-2 text-xs text-muted-foreground">
            {text}
          </pre>
        }
      >
        <PrismCode
          code={text}
          language={language}
          style={isDark ? jellybeansdark : jellybeanslight}
          fontSize="0.75rem"
          opacity={live ? 0.7 : 1}
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

  // Edit blocks with a diff start expanded; others start collapsed (unless error)
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
  const statusLabel = getStatusLabel(msg.status)

  return (
    <div
      className={cn(
        "w-full max-w-2xl animate-in self-start text-xs duration-150 fade-in-0 slide-in-from-bottom-1",
        msg.status === "error" && "text-destructive"
      )}
    >
      {/* Header */}
      <button
        className="flex w-full items-center gap-1.5 py-0.5 text-left transition-colors hover:text-foreground"
        onClick={toggle}
      >
        <span className="flex size-4 shrink-0 items-center justify-center">
          <ToolGlyph toolName={msg.toolName} />
        </span>
        <span className="shrink-0 font-medium text-foreground">
          {msg.toolName}
        </span>
        {summary && (
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            {summary}
          </span>
        )}
        {msg.status !== "done" && (
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1 font-medium",
              getStatusClasses(msg.status)
            )}
          >
            {msg.status === "running" && (
              <Loader2Icon className="h-3 w-3 animate-spin" />
            )}
            {msg.status === "error" && <XIcon className="h-3 w-3" />}
            {statusLabel}
          </span>
        )}
        <ChevronDownIcon
          className={cn(
            "h-3 w-3 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-180"
          )}
        />
      </button>

      {/* Body */}
      {expanded && (
        <div className="mt-1 ml-5 animate-in duration-150 fade-in-0 slide-in-from-top-1">
          {/* Edit: show pre-computed diff from SDK */}
          {isEdit && diff !== null && (
            <DiffView
              diff={diff}
              filePath={(msg.args as { path?: string }).path}
            />
          )}

          {/* Edit running — no diff yet */}
          {isEdit && diff === null && msg.status === "running" && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Loader2Icon className="size-3 animate-spin" />
              Editing…
            </div>
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
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Loader2Icon className="size-3 animate-spin" />
              Reading…
            </div>
          )}

          {/* Non-edit, non-read tools or error fallback */}
          {!isEdit &&
            !isRead &&
            resultText &&
            (msg.status === "error" ? (
              <pre className="max-h-48 overflow-auto break-all whitespace-pre-wrap text-destructive">
                {resultText}
              </pre>
            ) : (
              <LivePre text={resultText} live={msg.status === "running"} />
            ))}

          {!isEdit && !isRead && !resultText && msg.status === "running" && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Loader2Icon className="size-3 animate-spin" />
              Waiting for tool output…
            </div>
          )}

          {/* Edit / read error */}
          {(isEdit || isRead) && msg.status === "error" && resultText && (
            <pre className="max-h-48 overflow-auto break-all whitespace-pre-wrap text-destructive">
              {resultText}
            </pre>
          )}
        </div>
      )}
    </div>
  )
})
