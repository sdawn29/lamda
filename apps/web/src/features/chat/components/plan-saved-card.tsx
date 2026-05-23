import { memo, useState } from "react"
import {
  ChevronRightIcon,
  EyeIcon,
  ListTodoIcon,
  PlayIcon,
} from "lucide-react"

import { Button } from "@/shared/ui/button"
import { cn } from "@/shared/lib/utils"
import { FileIcon } from "@/shared/ui/file-icon"
import { useChatActions } from "../contexts/chat-actions-context"
import type { ToolMessage } from "../types"
import { WriteView } from "./write-view"

interface PlanSavedCardProps {
  msg: ToolMessage
  /** Workspace-relative plan path (e.g. `.agents/plans/add-foo.md`). */
  relativePath: string
  /** Absolute path on disk, used for opening in the file viewer. */
  absolutePath: string
  /** Plan content (from the write args). */
  content: string
  /** Stagger offset (ms) applied as CSS animation-delay when isNew is true. */
  isNew?: boolean
  entryDelayMs?: number
}

function planTitleFromContent(content: string, fallback: string): string {
  for (const line of content.split("\n")) {
    const trimmed = line.trim()
    if (trimmed.startsWith("# ")) return trimmed.slice(2).trim()
  }
  return fallback
}

function fileBasename(filePath: string): string {
  return filePath.split("/").pop() ?? filePath
}

export const PlanSavedCard = memo(function PlanSavedCard({
  msg,
  relativePath,
  absolutePath,
  content,
  isNew = true,
  entryDelayMs = 0,
}: PlanSavedCardProps) {
  const actions = useChatActions()
  const [expanded, setExpanded] = useState(false)

  const fileName = fileBasename(relativePath)
  const title = planTitleFromContent(content, fileName.replace(/\.md$/i, ""))
  const isRunning = msg.status === "running"
  const isError = msg.status === "error"

  return (
    <div
      className={cn(
        "w-full",
        isNew && "animate-chat-message-in",
      )}
      style={
        isNew && entryDelayMs > 0
          ? { animationDelay: `${entryDelayMs}ms` }
          : undefined
      }
    >
      <div
        className={cn(
          "overflow-hidden rounded-lg border bg-amber-500/5 transition-colors",
          isError
            ? "border-destructive/40"
            : "border-amber-500/30 hover:border-amber-500/50",
        )}
      >
        {/* Header */}
        <div className="flex items-start gap-2.5 px-3 py-2.5">
          <ListTodoIcon
            className={cn(
              "mt-0.5 h-4 w-4 shrink-0",
              isError ? "text-destructive/70" : "text-amber-600 dark:text-amber-400",
            )}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  "text-xs font-medium uppercase tracking-wider",
                  isRunning
                    ? "animate-thinking-shimmer bg-linear-to-r from-amber-600/40 via-amber-700 to-amber-600/40 bg-size-[200%_100%] bg-clip-text text-transparent dark:from-amber-300/40 dark:via-amber-200 dark:to-amber-300/40"
                    : isError
                      ? "text-destructive/80"
                      : "text-amber-700 dark:text-amber-300",
                )}
              >
                {isRunning ? "Saving plan…" : isError ? "Plan failed" : "Plan ready"}
              </span>
            </div>
            <p className="mt-0.5 truncate text-sm font-medium text-foreground/90">
              {title}
            </p>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground/70 hover:text-muted-foreground"
              aria-expanded={expanded}
            >
              <FileIcon filename={fileName} className="h-3 w-3 opacity-60" />
              <span className="font-mono">{relativePath}</span>
              <ChevronRightIcon
                className={cn(
                  "h-3 w-3 transition-transform",
                  expanded && "rotate-90",
                )}
              />
            </button>
          </div>
        </div>

        {/* Action buttons */}
        {!isError && !isRunning && actions && (
          <div className="flex gap-2 border-t border-amber-500/15 px-3 py-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 border-amber-500/30 bg-transparent text-xs hover:bg-amber-500/10 dark:border-amber-400/30"
              onClick={() => actions.openFile(absolutePath, fileName)}
            >
              <EyeIcon className="h-3.5 w-3.5" />
              Review
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 gap-1.5 bg-amber-500 text-xs text-white hover:bg-amber-500/90"
              onClick={() => actions.implementPlan(relativePath)}
            >
              <PlayIcon className="h-3.5 w-3.5" />
              Implement plan
            </Button>
          </div>
        )}

        {/* Expandable: full plan content */}
        <div
          className={cn(
            "grid transition-all duration-300 ease-in-out",
            expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          )}
        >
          <div className="overflow-hidden">
            <div className="border-t border-amber-500/15 px-3 py-2">
              <WriteView content={content} filePath={relativePath} live={isRunning} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})
