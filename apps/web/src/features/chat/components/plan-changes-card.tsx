import { memo, useMemo } from "react"
import { EyeIcon, ListTodoIcon, PlayIcon } from "lucide-react"

import { Button } from "@/shared/ui/button"
import { cn } from "@/shared/lib/utils"
import { FileIcon } from "@/shared/ui/file-icon"
import { useChatActions } from "../contexts/chat-actions-context"
import type { TurnSummary } from "@/features/git/api"

const PLAN_DIR_PREFIX = ".agents/plans/"

interface PlanChangesCardProps {
  /** Absolute path to the workspace root, used to compute file paths to open. */
  rootPath?: string
  turn: TurnSummary
}

/**
 * Replaces FileChangesCard when the latest turn only modified plan-mode
 * artifacts. Shows the plan(s) saved and Review / Implement CTAs instead of
 * the generic "Changes this turn" file list.
 */
export const PlanChangesCard = memo(function PlanChangesCard({
  rootPath,
  turn,
}: PlanChangesCardProps) {
  const actions = useChatActions()

  const planFiles = useMemo(() => {
    if (turn.files.length === 0) return null
    const all = turn.files.map((f) => f.filePath.replace(/\\/g, "/"))
    if (!all.every((p) => p.startsWith(PLAN_DIR_PREFIX) && p.toLowerCase().endsWith(".md"))) {
      return null
    }
    return all
  }, [turn])

  if (!planFiles) return null

  return (
    <div className="mx-auto mb-3 w-full max-w-3xl px-6 py-2">
      <div
        className={cn(
          "overflow-hidden rounded-lg border border-amber-500/30 bg-amber-500/5",
        )}
      >
        <div className="flex items-start gap-2.5 px-3 py-2.5">
          <ListTodoIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wider text-amber-700 dark:text-amber-300">
              {planFiles.length === 1 ? "Plan ready" : `${planFiles.length} plans ready`}
            </p>
            <ul className="mt-1 flex flex-col gap-0.5">
              {planFiles.map((rel) => {
                const fileName = rel.split("/").pop() ?? rel
                return (
                  <li
                    key={rel}
                    className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
                  >
                    <FileIcon filename={fileName} className="h-3 w-3 opacity-60" />
                    <span className="truncate font-mono">{rel}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>

        {actions && (
          <div className="flex flex-wrap gap-2 border-t border-amber-500/15 px-3 py-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 border-amber-500/30 bg-transparent text-xs hover:bg-amber-500/10 dark:border-amber-400/30"
              onClick={() => {
                const first = planFiles[0]
                if (!first) return
                const abs = rootPath
                  ? `${rootPath.endsWith("/") ? rootPath : rootPath + "/"}${first}`
                  : first
                actions.openFile(abs, first.split("/").pop())
              }}
            >
              <EyeIcon className="h-3.5 w-3.5" />
              Review
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 gap-1.5 bg-amber-500 text-xs text-white hover:bg-amber-500/90"
              onClick={() => {
                const first = planFiles[0]
                if (!first) return
                actions.implementPlan(first)
              }}
            >
              <PlayIcon className="h-3.5 w-3.5" />
              Implement plan
            </Button>
          </div>
        )}
      </div>
    </div>
  )
})
