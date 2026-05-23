import { memo, useState } from "react"
import { GitCommit, Loader2 } from "lucide-react"
import { cn } from "@/shared/lib/utils"
import { useGitLog, useGitShowFiles } from "../queries"
import type { CommitFile, LogEntry } from "../api"
import { type ChangedFile } from "./status-badge"
import { FileListItem } from "./file-list-item"

function formatRelativeDate(isoDate: string): string {
  const date = new Date(isoDate)
  if (isNaN(date.getTime())) return isoDate
  const diff = Date.now() - date.getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(months / 12)}y ago`
}

function commitFileToChangedFile(f: CommitFile): ChangedFile {
  return {
    raw: f.status + " ",
    filePath: f.path,
    isStaged: false,
    isUntracked: false,
  }
}

function CommitRow({
  entry,
  sessionId,
}: {
  entry: LogEntry
  sessionId: string
}) {
  const [expanded, setExpanded] = useState(false)
  const { data: files, isLoading } = useGitShowFiles(sessionId, entry.sha, expanded)

  return (
    <div className="relative mb-0.5 flex items-start gap-0.5">
      {/* Commit icon */}
      <div className="mt-[5px] flex h-[18px] w-[18px] shrink-0 items-center justify-center">
        <GitCommit
          className={cn(
            "size-[15px] rotate-90 transition-colors duration-150",
            expanded ? "text-primary/70" : "text-muted-foreground/40"
          )}
        />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 pb-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="group w-full rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <p className="truncate text-xs font-medium leading-snug text-foreground/85 group-hover:text-foreground">
            {entry.subject || "(no message)"}
          </p>
          <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground/45">
            <span className="rounded bg-muted/60 px-1 font-mono text-muted-foreground/60">
              {entry.shortSha}
            </span>
            <span>·</span>
            <span>{entry.author}</span>
            <span>·</span>
            <span>{formatRelativeDate(entry.date)}</span>
          </div>
        </button>

        {expanded && (
          <div className="animate-in fade-in-0 mt-1.5 overflow-hidden rounded-md border border-border/40 duration-150">
            {isLoading ? (
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />
                Loading…
              </div>
            ) : files && files.length > 0 ? (
              <div className="divide-y divide-border/20">
                {files.map((f) => (
                  <FileListItem
                    key={f.path}
                    file={commitFileToChangedFile(f)}
                    sessionId={sessionId}
                    sha={entry.sha}
                    counts={{ added: f.added, removed: f.removed }}
                    mode="inline"
                    showActions={false}
                  />
                ))}
              </div>
            ) : (
              <p className="px-3 py-2 text-[11px] text-muted-foreground/50">
                No files changed
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

interface HistoryViewProps {
  sessionId: string
}

export const HistoryView = memo(function HistoryView({
  sessionId,
}: HistoryViewProps) {
  const { data: entries = [], isLoading } = useGitLog(sessionId)

  if (isLoading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div className="flex items-center gap-2 text-xs text-muted-foreground/50">
          <Loader2 className="size-3 animate-spin" />
          Loading history…
        </div>
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-4 py-12 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          <GitCommit className="h-5 w-5 text-muted-foreground/40" />
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground/60">No commits yet</p>
          <p className="text-[10px] text-muted-foreground/40">
            Commits will appear here once you start committing
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
      <div className="relative">
        {entries.map((entry) => (
          <CommitRow key={entry.sha} entry={entry} sessionId={sessionId} />
        ))}
      </div>
    </div>
  )
})
