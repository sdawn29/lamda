import { memo, useCallback, useMemo, useState } from "react"
import { ChevronRight, Loader2, Minus, Plus, Undo2 } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip"
import { DiffView, type DiffMode } from "./diff-view"
import { StatusBadge, type ChangedFile } from "./status-badge"
import { DiffStat, parseDiffCounts } from "./diff-stat"
import { useGitFileDiff } from "../queries"
import { cn } from "@/shared/lib/utils"

export const FileAccordionItem = memo(function FileAccordionItem({
  file,
  sessionId,
  mode,
  onStageToggle,
  onRevert,
}: {
  file: ChangedFile
  sessionId: string
  mode: DiffMode
  onStageToggle: (file: ChangedFile) => Promise<void>
  onRevert: (file: ChangedFile) => Promise<void>
}) {
  const [expanded, setExpanded] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [reverting, setReverting] = useState(false)
  const { data: diff, isLoading: diffLoading } = useGitFileDiff(
    sessionId,
    file.filePath,
    file.raw,
    true
  )

  const counts = useMemo(
    () => (diff != null ? parseDiffCounts(diff) : null),
    [diff]
  )

  const handleToggle = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation()
      if (toggling) return
      setToggling(true)
      try {
        await onStageToggle(file)
      } finally {
        setToggling(false)
      }
    },
    [toggling, onStageToggle, file]
  )

  const handleRevert = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation()
      if (reverting) return
      setReverting(true)
      try {
        await onRevert(file)
      } finally {
        setReverting(false)
      }
    },
    [reverting, onRevert, file]
  )

  const pathParts = file.filePath.split("/")
  const fileName = pathParts[pathParts.length - 1] ?? file.filePath
  const dirPath =
    pathParts.length > 1 ? pathParts.slice(0, -1).join("/") + "/" : null

  return (
    <div className="group/file border-b border-border/30 last:border-0">
      <div className="flex w-full items-center transition-colors hover:bg-muted/40">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 py-2 pr-1 pl-2.5 text-left focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
        >
          <ChevronRight
            className={cn(
              "size-3 shrink-0 text-muted-foreground/40 transition-transform duration-150",
              expanded && "rotate-90"
            )}
          />
          <StatusBadge file={file} />
          <span className="flex min-w-0 flex-1 items-baseline gap-1.5 overflow-hidden pr-2">
            <span className="shrink-0 font-mono text-xs font-medium text-foreground/85">
              {fileName}
            </span>
            {dirPath && (
              <span className="truncate font-mono text-[10px] text-muted-foreground/40">
                {dirPath}
              </span>
            )}
            {counts != null && (
              <DiffStat added={counts.added} removed={counts.removed} />
            )}
          </span>
        </button>

        <div className="flex max-w-0 shrink-0 items-center gap-0.5 overflow-hidden transition-all duration-150 group-hover/file:max-w-20 group-hover/file:pr-1">
          {!file.isUntracked && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="h-6 w-6 text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive"
                    disabled={reverting}
                    onClick={handleRevert}
                  >
                    {reverting ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Undo2 className="h-3 w-3" />
                    )}
                    <span className="sr-only">Revert changes</span>
                  </Button>
                }
              />
              <TooltipContent>Revert changes</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="h-6 w-6 text-muted-foreground/60 hover:text-foreground"
                  disabled={toggling}
                  onClick={handleToggle}
                >
                  {toggling ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : file.isStaged ? (
                    <Minus className="h-3 w-3" />
                  ) : (
                    <Plus className="h-3 w-3" />
                  )}
                  <span className="sr-only">
                    {file.isStaged ? "Unstage" : "Stage"}
                  </span>
                </Button>
              }
            />
            <TooltipContent>
              {file.isStaged ? "Unstage file" : "Stage file"}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {expanded && (
        <div className="animate-in border-t border-border/30 bg-muted/10 px-3 pb-3 duration-150 fade-in-0 slide-in-from-top-1">
          {diffLoading ? (
            <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              Loading diff…
            </div>
          ) : diff != null ? (
            <DiffView
              diff={diff}
              filePath={file.filePath}
              mode={mode}
              className="mt-2 rounded-md border-border/50"
            />
          ) : null}
        </div>
      )}
    </div>
  )
})