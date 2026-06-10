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
          "overflow-hidden rounded-lg bg-card ring-1 transition-shadow",
          isError
            ? "ring-destructive/30"
            : "ring-foreground/10 hover:shadow-sm",
        )}
      >
        {/* Header */}
        <div className="flex items-start gap-3 px-3 py-3">
          <div
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-md",
              isError
                ? "bg-destructive/10 text-destructive"
                : "bg-amber-500/12 text-amber-600 dark:bg-amber-400/12 dark:text-amber-400",
            )}
          >
            <ListTodoIcon className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <span
              className={cn(
                "text-3xs font-semibold uppercase tracking-wider",
                isRunning
                  ? "animate-thinking-shimmer bg-linear-to-r from-amber-600/40 via-amber-700 to-amber-600/40 bg-size-[200%_100%] bg-clip-text text-transparent dark:from-amber-300/40 dark:via-amber-200 dark:to-amber-300/40"
                  : isError
                    ? "text-destructive/80"
                    : "text-amber-700 dark:text-amber-400",
              )}
            >
              {isRunning ? "Saving plan…" : isError ? "Plan failed" : "Plan ready"}
            </span>
            <p className="mt-0.5 truncate font-heading text-sm font-medium text-foreground">
              {title}
            </p>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 inline-flex max-w-full items-center gap-1 text-2xs text-muted-foreground transition-colors hover:text-foreground"
              aria-expanded={expanded}
            >
              <FileIcon filename={fileName} className="size-3 shrink-0 opacity-70" />
              <span className="truncate font-mono">{relativePath}</span>
              <ChevronRightIcon
                className={cn(
                  "size-3 shrink-0 transition-transform",
                  expanded && "rotate-90",
                )}
              />
            </button>
          </div>
        </div>

        {/* Action buttons */}
        {!isError && !isRunning && actions && (
          <div className="flex gap-2 border-t border-border px-3 py-2.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5"
              onClick={() => actions.openFile(absolutePath, fileName)}
            >
              <EyeIcon className="size-3.5" />
              Review
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 gap-1.5 bg-amber-600 text-white hover:bg-amber-600/90 dark:bg-amber-500 dark:text-amber-950 dark:hover:bg-amber-400"
              onClick={() => actions.implementPlan(relativePath)}
            >
              <PlayIcon className="size-3.5" />
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
            <div className="border-t border-border px-3 py-2">
              <WriteView content={content} filePath={relativePath} live={isRunning} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})
