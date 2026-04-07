import { useEffect, useState } from "react"
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
import { cn } from "@/lib/utils"

interface CommitDialogProps {
  cwd: string | undefined
}

interface ChangedFile {
  statusCode: string
  filePath: string
}

function DiffView({ diff }: { diff: string }) {
  const lines = diff.split("\n")
  return (
    <div className="font-mono text-xs">
      {lines.map((line, i) => {
        const isAdd = line.startsWith("+") && !line.startsWith("+++")
        const isRemove = line.startsWith("-") && !line.startsWith("---")
        const isHunk = line.startsWith("@@")
        const isMeta =
          line.startsWith("diff ") ||
          line.startsWith("index ") ||
          line.startsWith("--- ") ||
          line.startsWith("+++ ")
        return (
          <div
            key={i}
            className={cn(
              "whitespace-pre leading-5 px-3",
              isAdd && "bg-green-500/10 text-green-700 dark:text-green-400",
              isRemove && "bg-red-500/10 text-red-700 dark:text-red-400",
              isHunk && "bg-blue-500/5 text-blue-500 dark:text-blue-400",
              isMeta && "text-muted-foreground",
            )}
          >
            {line || " "}
          </div>
        )
      })}
    </div>
  )
}

function statusColor(code: string) {
  const c = code.trim()
  if (c === "M" || c === "MM") return "text-yellow-500 dark:text-yellow-400"
  if (c === "A" || c === "AM") return "text-green-600 dark:text-green-400"
  if (c === "D") return "text-red-500 dark:text-red-400"
  if (c === "??") return "text-blue-500 dark:text-blue-400"
  if (c === "R") return "text-purple-500 dark:text-purple-400"
  return "text-muted-foreground"
}

function FileAccordionItem({
  file,
  cwd,
}: {
  file: ChangedFile
  cwd: string
}) {
  const [expanded, setExpanded] = useState(false)
  const [diff, setDiff] = useState<string | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)

  function toggle() {
    if (!expanded && diff === null) {
      setDiffLoading(true)
      window.electronAPI
        ?.gitFileDiff(cwd, file.filePath, file.statusCode)
        .then((out) => setDiff(out))
        .catch((err: Error) => setDiff(`Error: ${err.message}`))
        .finally(() => setDiffLoading(false))
    }
    setExpanded((v) => !v)
  }

  return (
    <div className="border-b border-border/50 last:border-0">
      <button
        onClick={toggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
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
        <div className="border-t border-border/50 bg-muted/20 overflow-x-auto">
          {diffLoading ? (
            <div className="flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              Loading diff…
            </div>
          ) : diff !== null ? (
            <DiffView diff={diff} />
          ) : null}
        </div>
      )}
    </div>
  )
}

export function CommitDialog({ cwd }: CommitDialogProps) {
  const [open, setOpen] = useState(false)
  const [files, setFiles] = useState<ChangedFile[]>([])
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !cwd) return
    setLoading(true)
    setError(null)
    setSuccess(null)
    window.electronAPI
      ?.gitStatus(cwd)
      .then((out) => {
        const parsed = out
          .split("\n")
          .map((l) => l.trimEnd())
          .filter(Boolean)
          .map((l) => ({ statusCode: l.slice(0, 2), filePath: l.slice(3) }))
        setFiles(parsed)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [open, cwd])

  async function handleCommit() {
    if (!cwd || !message.trim()) return
    setCommitting(true)
    setError(null)
    setSuccess(null)
    try {
      const out = await window.electronAPI?.gitCommit(cwd, message.trim())
      setSuccess(out ?? "Committed.")
      setMessage("")
      setFiles([])
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setCommitting(false)
    }
  }

  const hasChanges = files.length > 0

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={!cwd}
            aria-label="Commit changes"
          />
        }
      >
        <GitCommit />
      </DialogTrigger>
      <DialogContent
        showCloseButton={true}
        className="flex flex-col gap-3 sm:max-w-xl"
      >
        <DialogHeader>
          <DialogTitle>Commit changes</DialogTitle>
        </DialogHeader>

        {/* File accordion */}
        <div className="rounded-md border border-border/50 overflow-hidden">
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
            {!loading && cwd && files.map((file, i) => (
              <FileAccordionItem key={i} file={file} cwd={cwd} />
            ))}
          </div>
        </div>

        {/* Commit message */}
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
