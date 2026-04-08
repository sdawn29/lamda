import { useState, useMemo } from "react"
import { GitCommit, Loader2, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { DiffView } from "@/components/diff-view"
import { cn } from "@/lib/utils"
import { useGitStatus } from "@/queries/use-git-status"
import { useGitFileDiff } from "@/queries/use-git-file-diff"
import { useGitCommit } from "@/mutations/use-git-commit"

interface CommitDialogProps {
  sessionId: string | undefined
}

interface ChangedFile {
  statusCode: string
  filePath: string
}

function statusColor(code: string) {
  const c = code.trim()
  if (c === "M" || c === "MM") return "text-yellow-500 dark:text-yellow-400"
  if (c === "A" || c === "AM") return "text-green-600 dark:text-green-400"
  if (c === "D") return "text-red-500 dark:text-red-400"
  if (c === "U") return "text-blue-500 dark:text-blue-400"
  if (c === "R") return "text-purple-500 dark:text-purple-400"
  return "text-muted-foreground"
}

function FileAccordionItem({
  file,
  sessionId,
}: {
  file: ChangedFile
  sessionId: string
}) {
  const [expanded, setExpanded] = useState(false)

  const { data: diff, isLoading: diffLoading } = useGitFileDiff(
    sessionId,
    file.filePath,
    file.statusCode,
    expanded,
  )

  return (
    <div className="border-b border-border/50 last:border-0">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/50"
      >
        <ChevronRight
          className={cn(
            "size-3 shrink-0 text-muted-foreground transition-transform duration-150",
            expanded && "rotate-90",
          )}
        />
        <span className={cn("w-5 shrink-0 font-mono text-xs", statusColor(file.statusCode))}>
          {file.statusCode}
        </span>
        <span className="truncate font-mono text-xs text-foreground/80">
          {file.filePath}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-border/50">
          {diffLoading ? (
            <div className="flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              Loading diff…
            </div>
          ) : diff != null ? (
            <DiffView diff={diff} filePath={file.filePath} className="rounded-none border-x-0 border-b-0" />
          ) : null}
        </div>
      )}
    </div>
  )
}

export function CommitDialog({ sessionId }: CommitDialogProps) {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState("")
  const [success, setSuccess] = useState<string | null>(null)

  const { data: statusRaw, isLoading: loading, error: statusError } = useGitStatus(
    sessionId ?? "",
    // enabled only when dialog is open and sessionId is set
  )
  const commitMutation = useGitCommit(sessionId ?? "")

  const files = useMemo<ChangedFile[]>(() => {
    if (!open || !statusRaw) return []
    return statusRaw
      .split("\n")
      .map((l) => l.trimEnd())
      .filter(Boolean)
      .map((l) => ({
        statusCode: l.slice(0, 2) === "??" ? "U" : l.slice(0, 2),
        filePath: l.slice(3),
      }))
  }, [open, statusRaw])

  const error =
    statusError instanceof Error
      ? statusError.message
      : commitMutation.error instanceof Error
        ? commitMutation.error.message
        : null

  async function handleCommit() {
    if (!sessionId || !message.trim()) return
    setSuccess(null)
    try {
      const out = await commitMutation.mutateAsync(message.trim())
      setSuccess(out || "Committed.")
      setMessage("")
    } catch {
      // error shown via commitMutation.error
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) {
      setSuccess(null)
      commitMutation.reset()
    }
  }

  const hasChanges = files.length > 0
  const committing = commitMutation.isPending

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={<Button variant="outline" size="sm" disabled={!sessionId} />}
      >
        <GitCommit />
        Commit
      </DialogTrigger>
      <DialogContent showCloseButton={true} className="flex flex-col gap-3 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Commit changes</DialogTitle>
        </DialogHeader>

        <div className="overflow-hidden rounded-md border border-border/50">
          <div className="border-b border-border/50 bg-muted/30 px-3 py-1.5">
            <p className="text-xs text-muted-foreground">Changed files</p>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {loading && (
              <div className="flex items-center gap-1.5 px-3 py-3 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />
                Loading…
              </div>
            )}
            {!loading && !hasChanges && !error && (
              <p className="px-3 py-3 text-xs text-muted-foreground">No changes</p>
            )}
            {!loading && sessionId && files.map((file, i) => (
              <FileAccordionItem key={i} file={file} sessionId={sessionId} />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <p className="text-xs text-muted-foreground">Commit message</p>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Describe your changes…"
            rows={3}
            className="resize-none text-xs"
          />
        </div>

        {error && (
          <p className="rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
            {error}
          </p>
        )}
        {success && (
          <p className="rounded-md bg-green-500/10 px-2 py-1.5 text-xs text-green-600 dark:text-green-400">
            {success}
          </p>
        )}

        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={handleCommit}
            disabled={committing || !message.trim() || !hasChanges || loading}
          >
            {committing && <Loader2 className="mr-1.5 size-3 animate-spin" />}
            Commit
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
