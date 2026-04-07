import { useState, useMemo, memo } from "react"
import {
  CheckIcon,
  ChevronDownIcon,
  FileEditIcon,
  Loader2Icon,
  WrenchIcon,
  XIcon,
} from "lucide-react"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import vscDarkPlus from "react-syntax-highlighter/dist/esm/styles/prism/vsc-dark-plus"
import vs from "react-syntax-highlighter/dist/esm/styles/prism/vs"

import { cn } from "@/lib/utils"
import { LivePre } from "@/components/live-pre"
import { DiffView, detectLanguage } from "@/components/diff-view"
import { useTheme } from "@/components/theme-provider"
import type { ToolMessage } from "@/components/chat-types"

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
      <SyntaxHighlighter
        language={language}
        style={isDark ? vscDarkPlus : vs}
        customStyle={{
          margin: 0,
          padding: "0.5rem 0.75rem",
          background: "transparent",
          fontSize: "0.75rem",
          lineHeight: "1.5",
          opacity: live ? 0.7 : 1,
        }}
        wrapLongLines={false}
      >
        {text}
      </SyntaxHighlighter>
    </div>
  )
}

// ── ToolCallBlock ──────────────────────────────────────────────────────────────

export const ToolCallBlock = memo(function ToolCallBlock({
  msg,
}: {
  msg: ToolMessage
}) {
  const isEdit = msg.toolName === "edit" && isEditArgs(msg.args)
  const diff = isEdit ? getEditDiff(msg.result) : null
  const isRead = isReadTool(msg.toolName, msg.args)
  const readFilePath = isRead ? getReadFilePath(msg.args) : null

  // Edit blocks with a diff start expanded; others start collapsed (unless error)
  const defaultExpanded = (isEdit && diff !== null) || msg.status === "error"
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
    <div
      className={cn(
        "w-full max-w-2xl self-start rounded-lg border text-xs",
        msg.status === "error"
          ? "border-destructive/50 bg-destructive/5"
          : "border-border bg-muted/20"
      )}
    >
      {/* Header */}
      <button
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
        onClick={toggle}
      >
        {msg.status === "running" ? (
          <Loader2Icon className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
        ) : msg.status === "error" ? (
          <XIcon className="h-3.5 w-3.5 shrink-0 text-destructive" />
        ) : (
          <CheckIcon className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
        )}
        {isEdit ? (
          <FileEditIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
        ) : (
          <WrenchIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
        )}
        <span className="font-medium text-foreground">{msg.toolName}</span>
        {summary && (
          <span className="truncate text-muted-foreground">{summary}</span>
        )}
        <ChevronDownIcon
          className={cn(
            "ml-auto h-3 w-3 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-180"
          )}
        />
      </button>

      {/* Body */}
      {expanded && (
        <div className="px-3 pb-3">
          <div
            className={cn(
              "mb-2 border-t",
              msg.status === "error" ? "border-destructive/30" : "border-border"
            )}
          />

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
