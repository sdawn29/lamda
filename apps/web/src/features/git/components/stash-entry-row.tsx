import { memo, useCallback, useState } from "react"
import { Download, GitBranch, Loader2, PackageOpen, Trash2 } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip"

export interface StashEntry {
  ref: string
  index: number
  branch: string
  message: string
}

export function parseStashList(raw: string): StashEntry[] {
  return raw
    .split("\n")
    .map((l) => l.trimEnd())
    .filter(Boolean)
    .map((l) => {
      const tab = l.indexOf("\t")
      const ref = tab === -1 ? l : l.slice(0, tab)
      const rest = tab === -1 ? l : l.slice(tab + 1)

      const indexMatch = ref.match(/\{(\d+)\}/)
      const index = indexMatch ? parseInt(indexMatch[1], 10) : 0

      const branchMatch = rest.match(/^(?:WIP )?[Oo]n ([^:]+):?\s*(.*)/)
      const branch = branchMatch?.[1]?.trim() ?? ""
      const message = branchMatch?.[2]?.trim() || rest

      return { ref, index, branch, message: message || "WIP changes" }
    })
}

export const StashEntryRow = memo(function StashEntryRow({
  entry,
  onApply,
  onPop,
  onDrop,
}: {
  entry: StashEntry
  onApply: (ref: string) => Promise<void>
  onPop: (ref: string) => Promise<void>
  onDrop: (ref: string) => Promise<void>
}) {
  const [working, setWorking] = useState<"apply" | "pop" | "drop" | null>(null)

  const run = useCallback(
    async (action: "apply" | "pop" | "drop") => {
      if (working) return
      setWorking(action)
      try {
        if (action === "apply") await onApply(entry.ref)
        else if (action === "pop") await onPop(entry.ref)
        else await onDrop(entry.ref)
      } finally {
        setWorking(null)
      }
    },
    [working, onApply, onPop, onDrop, entry.ref]
  )

  return (
    <div className="group flex items-center gap-2.5 border-b border-border/30 px-3 py-2 last:border-0 hover:bg-muted/40">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-semibold text-muted-foreground">
        {entry.index}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-foreground/85">{entry.message}</p>
        {entry.branch && (
          <div className="mt-0.5 flex items-center gap-1">
            <GitBranch className="h-2.5 w-2.5 shrink-0 text-muted-foreground/40" />
            <span className="truncate font-mono text-[10px] text-muted-foreground/50">
              {entry.branch}
            </span>
          </div>
        )}
      </div>

      {working ? (
        <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground/60" />
      ) : (
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="h-6 w-6 text-muted-foreground/60 hover:text-foreground"
                  onClick={() => run("pop")}
                >
                  <PackageOpen className="h-3 w-3" />
                  <span className="sr-only">Pop</span>
                </Button>
              }
            />
            <TooltipContent>Pop stash</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="h-6 w-6 text-muted-foreground/60 hover:text-foreground"
                  onClick={() => run("apply")}
                >
                  <Download className="h-3 w-3" />
                  <span className="sr-only">Apply</span>
                </Button>
              }
            />
            <TooltipContent>Apply stash</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="h-6 w-6 text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => run("drop")}
                >
                  <Trash2 className="h-3 w-3" />
                  <span className="sr-only">Drop</span>
                </Button>
              }
            />
            <TooltipContent>Drop stash</TooltipContent>
          </Tooltip>
        </div>
      )}
    </div>
  )
})