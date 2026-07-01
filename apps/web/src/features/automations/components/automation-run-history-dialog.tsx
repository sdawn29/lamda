import { useNavigate } from "@tanstack/react-router"
import { CheckCircle2, XCircle, Loader2, ExternalLink } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import { useAutomationRuns } from "../queries"
import type { Automation, AutomationRun } from "../types"

interface RunHistoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  automation: Automation | null
}

export function AutomationRunHistoryDialog({
  open,
  onOpenChange,
  automation,
}: RunHistoryDialogProps) {
  const { data: runs = [], isLoading } = useAutomationRuns(
    automation?.id ?? "",
    open && !!automation,
  )
  const navigate = useNavigate()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[520px]">
        <DialogHeader className="border-b px-4 pt-4 pb-3">
          <DialogTitle className="truncate text-sm font-semibold">
            Run history — {automation?.name}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col overflow-y-auto px-2 py-2">
          {isLoading ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              Loading
            </p>
          ) : runs.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              No runs yet.
            </p>
          ) : (
            runs.map((run) => (
              <RunRow
                key={run.id}
                run={run}
                onOpenThread={(threadId) => {
                  onOpenChange(false)
                  navigate({
                    to: "/workspace/$threadId",
                    params: { threadId },
                  })
                }}
              />
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function RunRow({
  run,
  onOpenThread,
}: {
  run: AutomationRun
  onOpenThread: (threadId: string) => void
}) {
  return (
    <div className="group flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-accent">
      <RunStatusIcon status={run.status} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-xs">
          {formatDateTime(run.startedAt)}
          <span className="ml-2 text-3xs text-muted-foreground/60">
            {run.trigger === "manual" ? "manual" : "scheduled"}
          </span>
        </span>
        {run.error ? (
          <span className="truncate text-3xs text-destructive">{run.error}</span>
        ) : (
          <span className="text-3xs text-muted-foreground/60">
            {formatDuration(run.startedAt, run.finishedAt)}
          </span>
        )}
      </div>
      {run.threadId && (
        <button
          className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-3xs text-muted-foreground/60 opacity-0 transition hover:text-foreground group-hover:opacity-100"
          onClick={() => onOpenThread(run.threadId!)}
        >
          <ExternalLink className="size-3" />
          thread
        </button>
      )}
    </div>
  )
}

export function RunStatusIcon({
  status,
}: {
  status: AutomationRun["status"]
}) {
  if (status === "running")
    return <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground/60" />
  if (status === "ok")
    return <CheckCircle2 className="size-4 shrink-0 text-green-500" />
  return <XCircle className="size-4 shrink-0 text-red-500" />
}

function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatDuration(start: number, end: number | null): string {
  if (!end) return "running"
  const secs = Math.max(0, Math.round((end - start) / 1000))
  if (secs < 60) return `${secs}s`
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}m ${String(s).padStart(2, "0")}s`
}
