import { memo, useMemo } from "react"
import { BotIcon, EyeIcon, ListTodoIcon } from "lucide-react"

import { Button } from "@/shared/ui/button"
import { FileIcon } from "@/shared/ui/file-icon"
import { SectionLabel } from "@/shared/ui/section-label"
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
      <div className="overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10">
        <div className="flex items-start gap-3 px-3 py-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-amber-500/12 text-amber-600 dark:bg-amber-400/12 dark:text-amber-400">
            <ListTodoIcon className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <SectionLabel className="block text-amber-700 dark:text-amber-400">
              {planFiles.length === 1 ? "Plan ready" : `${planFiles.length} plans ready`}
            </SectionLabel>
            <ul className="mt-1.5 flex flex-col gap-1">
              {planFiles.map((rel) => {
                const fileName = rel.split("/").pop() ?? rel
                return (
                  <li
                    key={rel}
                    className="flex items-center gap-1.5 text-xs text-foreground/80"
                  >
                    <FileIcon filename={fileName} className="size-3 shrink-0 opacity-70" />
                    <span className="truncate font-mono">{rel}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>

        {actions && (
          <div className="flex flex-wrap gap-2 border-t border-border px-3 py-2.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5"
              onClick={() => {
                const first = planFiles[0]
                if (!first) return
                const abs = rootPath
                  ? `${rootPath.endsWith("/") ? rootPath : rootPath + "/"}${first}`
                  : first
                actions.openFile(abs, first.split("/").pop())
              }}
            >
              <EyeIcon className="size-3.5" />
              Review
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 gap-1.5 bg-amber-600 text-white hover:bg-amber-600/90 dark:bg-amber-500 dark:text-amber-950 dark:hover:bg-amber-400"
              onClick={() => {
                const first = planFiles[0]
                if (!first) return
                actions.implementPlan(first)
              }}
            >
              <BotIcon className="size-3.5" />
              Implement plan
            </Button>
          </div>
        )}
      </div>
    </div>
  )
})
