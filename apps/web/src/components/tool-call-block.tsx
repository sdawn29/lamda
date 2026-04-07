import { useState, useMemo } from "react"
import {
  CheckIcon,
  ChevronDownIcon,
  Loader2Icon,
  WrenchIcon,
  XIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { LivePre } from "@/components/live-pre"
import type { ToolMessage } from "@/components/chat-types"

function argsSummary(args: unknown): string {
  if (typeof args !== "object" || args === null) return ""
  const a = args as Record<string, unknown>
  if (typeof a.command === "string") return a.command
  if (typeof a.file_path === "string") return a.file_path
  if (typeof a.path === "string") return a.path
  if (typeof a.pattern === "string") return a.pattern
  const first = Object.values(a)[0]
  return typeof first === "string" ? first : ""
}

export function ToolCallBlock({ msg }: { msg: ToolMessage }) {
  // Auto-expand while running, collapse when done unless user has toggled it
  const [userToggled, setUserToggled] = useState(false)
  const [manualExpanded, setManualExpanded] = useState(false)
  const expanded = userToggled ? manualExpanded : msg.status === "error"

  function toggle() {
    setUserToggled(true)
    setManualExpanded((e) => !e)
  }

  // const argsText = useMemo(
  //   () =>
  //     typeof msg.args === "object"
  //       ? JSON.stringify(msg.args, null, 2)
  //       : String(msg.args),
  //   [msg.args]
  // )

  const resultText = useMemo(() => {
    if (msg.result === undefined) return null
    if (typeof msg.result === "string") return msg.result
    // MCP-style tool output: { content: [{ type: "text", text: "..." }] }
    if (
      typeof msg.result === "object" &&
      msg.result !== null &&
      Array.isArray((msg.result as Record<string, unknown>).content)
    ) {
      const parts = (
        msg.result as { content: { type: string; text?: string }[] }
      ).content
      const text = parts
        .filter((p) => p.type === "text" && typeof p.text === "string")
        .map((p) => p.text)
        .join("")
      if (text) return text
    }
    return JSON.stringify(msg.result, null, 2)
  }, [msg.result])

  const summary = argsSummary(msg.args)

  return (
    <div className={cn("w-full max-w-2xl self-start rounded-lg border text-xs", msg.status === "error" ? "border-destructive/50 bg-destructive/5" : "border-border bg-muted/20")}>
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
        <WrenchIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
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

      {expanded && resultText && (
        <div className="space-y-2 px-3 py-2">
          <div className={cn("border-t", msg.status === "error" ? "border-destructive/30" : "border-border")} />
          {msg.status === "error" ? (
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all text-destructive">
              {resultText}
            </pre>
          ) : (
            <LivePre text={resultText} live={msg.status === "running"} />
          )}
        </div>
      )}
    </div>
  )
}
