import { useCallback, useEffect, useRef, useState } from "react"
import {
  CheckIcon,
  FilePenLineIcon,
  PlugIcon,
  TerminalIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/shared/lib/utils"
import { Button } from "@/shared/ui/button"
import { LoadingSpinner } from "@/shared/ui/loading-spinner"
import { submitToolApproval, type ToolApprovalChoice } from "../api"

export interface PendingApproval {
  toolCallId: string
  toolName: string
  input: Record<string, unknown>
  /** What an Always/Don't-allow decision will remember (e.g. `git status`). */
  scopeLabel: string
}

interface ToolMeta {
  /** Icon shown in the header. */
  icon: LucideIcon
  /** Short action label, e.g. "Run command". */
  label: string
  /** The primary thing being acted on (command / file path / arg), if any. */
  target?: string
  /** Render the target as a shell command (with a `$` prompt). */
  isCommand?: boolean
}

const str = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined

/** Describe what a tool call is about to do, for the header + target display. */
function describeTool(toolName: string, input: Record<string, unknown>): ToolMeta {
  switch (toolName) {
    case "bash":
      return {
        icon: TerminalIcon,
        label: "Run command",
        target: str(input.command),
        isCommand: true,
      }
    case "edit":
      return {
        icon: FilePenLineIcon,
        label: "Edit file",
        target: str(input.path) ?? str(input.file_path),
      }
    case "write":
      return {
        icon: FilePenLineIcon,
        label: "Write file",
        target: str(input.path) ?? str(input.file_path),
      }
    default:
      return {
        icon: PlugIcon,
        label: `Run ${toolName}`,
        target: Object.values(input).find((v) => typeof v === "string") as
          | string
          | undefined,
      }
  }
}

interface ToolApprovalBlockProps {
  sessionId: string
  approval: PendingApproval
}

export function ToolApprovalBlock({
  sessionId,
  approval,
}: ToolApprovalBlockProps) {
  const { toolCallId, toolName, input, scopeLabel } = approval
  const [pending, setPending] = useState<ToolApprovalChoice | null>(null)
  const allowRef = useRef<HTMLButtonElement>(null)

  const meta = describeTool(toolName, input)
  const Icon = meta.icon
  // For bash, decisions are remembered per command (e.g. `git status`); for
  // every other tool they apply to the whole tool.
  const remembers = toolName === "bash" ? scopeLabel : toolName
  const isSubmitting = pending !== null

  const decide = useCallback(
    async (decision: ToolApprovalChoice) => {
      if (pending) return
      setPending(decision)
      try {
        await submitToolApproval(sessionId, toolCallId, decision)
        // The block unmounts once the resolved event clears it from state.
      } catch (err) {
        setPending(null)
        toast.error("Couldn't submit your decision", {
          description: err instanceof Error ? err.message : "Please try again.",
        })
      }
    },
    [pending, sessionId, toolCallId]
  )

  // The panel replaces the chat input while a tool is pending, so land focus on
  // the safe default for immediate keyboard/screen-reader access.
  useEffect(() => {
    allowRef.current?.focus()
  }, [])

  // Window-level shortcuts so they work wherever focus lands — but never while
  // the user is typing in some other field: ⏎ allow · ⌘⏎ always · esc deny.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing) return
      const t = e.target
      const inText =
        t instanceof HTMLTextAreaElement ||
        t instanceof HTMLInputElement ||
        (t instanceof HTMLElement && t.isContentEditable)
      if (inText) return
      if (e.key === "Enter") {
        e.preventDefault()
        void decide(e.metaKey || e.ctrlKey ? "always" : "once")
      } else if (e.key === "Escape") {
        e.preventDefault()
        void decide("never")
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [decide])

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-3 rounded-2xl border border-border/70 bg-card p-3 shadow-sm",
        "animate-in duration-300 fade-in-0 slide-in-from-bottom-2"
      )}
    >
      {/* Header — icon + title/subtitle + tool name */}
      <div className="flex items-center gap-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 ring-1 ring-inset ring-amber-500/20 dark:text-amber-400">
          <Icon className="size-4" />
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="text-sm leading-tight font-semibold text-foreground">
            {meta.label}
          </span>
          <span className="text-3xs leading-tight text-muted-foreground">
            Needs your approval to continue
          </span>
        </div>
        <span className="ml-auto shrink-0 rounded-md bg-muted px-1.5 py-0.5 font-mono text-3xs text-muted-foreground">
          {toolName}
        </span>
      </div>

      {/* Target — the command / file / arg being acted on (focal) */}
      {meta.target && (
        <div className="max-h-32 overflow-auto rounded-lg border border-border/60 bg-muted/40 px-3 py-2">
          <code className="block font-mono text-xs leading-relaxed whitespace-pre-wrap break-all text-foreground">
            {meta.isCommand && (
              <span className="mr-1.5 select-none text-muted-foreground">$</span>
            )}
            {meta.target}
          </code>
        </div>
      )}

      {/* Scope explainer */}
      <p className="text-3xs leading-snug text-muted-foreground">
        <span className="font-medium text-foreground">Always allow</span> /{" "}
        <span className="font-medium text-foreground">Don&apos;t allow</span>{" "}
        remember{" "}
        <span className="rounded bg-muted px-1 py-px font-mono text-foreground">
          {remembers}
        </span>{" "}
        for this workspace.
      </p>

      {/* Actions */}
      <div className="flex items-center justify-between gap-2 border-t border-border/50 pt-3">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => decide("never")}
          disabled={isSubmitting}
          title="Don't allow — block and let the agent continue (Esc)"
          className="h-6 gap-1 px-1.5 text-2xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          {pending === "never" ? (
            <LoadingSpinner size="sm" />
          ) : (
            <XIcon className="size-3" />
          )}
          Don&apos;t allow
          <span className="ml-0.5 text-muted-foreground/70">esc</span>
        </Button>

        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            onClick={() => decide("always")}
            disabled={isSubmitting}
            title={`Always allow ${remembers} in this workspace (⌘⏎)`}
            className="h-6 gap-1 px-1.5 text-2xs"
          >
            {pending === "always" ? <LoadingSpinner size="sm" /> : null}
            Always allow
            <span className="ml-0.5 text-muted-foreground/70">⌘⏎</span>
          </Button>
          <Button
            ref={allowRef}
            size="sm"
            onClick={() => decide("once")}
            disabled={isSubmitting}
            title="Allow once — run this single time (⏎)"
            className="h-6 gap-1 px-2 text-2xs"
          >
            {pending === "once" ? (
              <LoadingSpinner size="sm" />
            ) : (
              <CheckIcon className="size-3" />
            )}
            Allow once
            <span className="ml-0.5 text-primary-foreground/70">⏎</span>
          </Button>
        </div>
      </div>
    </div>
  )
}
