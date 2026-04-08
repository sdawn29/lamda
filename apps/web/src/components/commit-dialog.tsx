import { useState, useMemo, useRef, useEffect } from "react"
import {
  GitCommit,
  Loader2,
  ChevronRight,
  GitBranch,
  CloudUpload,
  Sparkles,
  Settings2,
} from "lucide-react"
import { useNavigate } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog"
import { DiffView } from "@/components/diff-view"
import { cn } from "@/lib/utils"
import { useGitStatus } from "@/queries/use-git-status"
import { useGitFileDiff } from "@/queries/use-git-file-diff"
import { useGitCommit } from "@/mutations/use-git-commit"
import { useGitPush } from "@/mutations/use-git-push"
import { useBranch } from "@/queries/use-branch"
import { gitGenerateCommitMessage } from "@/api/git"

export const COMMIT_PROMPT_STORAGE_KEY = "lambda:commit-message-prompt"

interface CommitDialogProps {
  sessionId: string | undefined
}

interface ChangedFile {
  statusCode: string
  filePath: string
  isStaged: boolean
}

function parseFile(line: string): ChangedFile {
  const statusCode = line.slice(0, 2)
  const filePath = line.slice(3)
  const isStaged = statusCode !== "??" && statusCode[0] !== " "
  return { statusCode, filePath, isStaged }
}

function statusChar(code: string): string {
  if (code === "??" || code.trim() === "U") return "U"
  const X = code[0] ?? " "
  const Y = code[1] ?? " "
  if (X !== " ") return X
  return Y
}

function statusColor(code: string) {
  const c = statusChar(code)
  if (c === "M") return "text-yellow-500 dark:text-yellow-400"
  if (c === "A") return "text-green-500 dark:text-green-400"
  if (c === "D") return "text-red-500 dark:text-red-400"
  if (c === "U") return "text-blue-500 dark:text-blue-400"
  if (c === "R") return "text-purple-500 dark:text-purple-400"
  return "text-muted-foreground"
}

function FileAccordionItem({
  file,
  sessionId,
  dim,
}: {
  file: ChangedFile
  sessionId: string
  dim?: boolean
}) {
  const [expanded, setExpanded] = useState(false)

  const { data: diff, isLoading: diffLoading } = useGitFileDiff(
    sessionId,
    file.filePath,
    file.statusCode,
    expanded
  )

  const pathParts = file.filePath.split("/")
  const fileName = pathParts[pathParts.length - 1] ?? file.filePath
  const dirPath = pathParts.length > 1 ? pathParts.slice(0, -1).join("/") : null

  return (
    <div
      className={cn(
        "border-b border-border/40 last:border-0",
        dim && "opacity-40"
      )}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-muted/50"
      >
        <ChevronRight
          className={cn(
            "size-3 shrink-0 text-muted-foreground transition-transform duration-150",
            expanded && "rotate-90"
          )}
        />
        <span
          className={cn(
            "w-4 shrink-0 font-mono text-[11px] font-medium",
            statusColor(file.statusCode)
          )}
        >
          {statusChar(file.statusCode)}
        </span>
        <span className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className="shrink-0 text-xs text-foreground/90">
            {fileName}
          </span>
          {dirPath && (
            <span className="truncate font-mono text-[10px] text-muted-foreground/50">
              {dirPath}
            </span>
          )}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-border/40">
          {diffLoading ? (
            <div className="flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              Loading diff…
            </div>
          ) : diff != null ? (
            <DiffView
              diff={diff}
              filePath={file.filePath}
              className="rounded-none border-x-0 border-b-0"
            />
          ) : null}
        </div>
      )}
    </div>
  )
}

// Auto-growing textarea
function AutoTextarea({
  value,
  onChange,
  placeholder,
  className,
  onKeyDown,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!ref.current) return
    ref.current.style.height = "auto"
    ref.current.style.height = `${ref.current.scrollHeight}px`
  }, [value])

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      rows={3}
      className={cn(
        "w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground/40",
        className
      )}
    />
  )
}

export function CommitDialog({ sessionId }: CommitDialogProps) {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState("")
  const [generating, setGenerating] = useState(false)
  const navigate = useNavigate()

  const { data: statusRaw, isLoading: loading } = useGitStatus(sessionId ?? "")
  const { data: branchData } = useBranch(sessionId ?? "")
  const commitMutation = useGitCommit(sessionId ?? "")
  const pushMutation = useGitPush(sessionId ?? "")

  const branch = branchData?.branch ?? null

  const { staged, unstaged } = useMemo<{
    staged: ChangedFile[]
    unstaged: ChangedFile[]
  }>(() => {
    if (!open || !statusRaw) return { staged: [], unstaged: [] }
    const all = statusRaw
      .split("\n")
      .map((l) => l.trimEnd())
      .filter(Boolean)
      .map(parseFile)
    return {
      staged: all.filter((f) => f.isStaged),
      unstaged: all.filter((f) => !f.isStaged),
    }
  }, [open, statusRaw])

  const error =
    commitMutation.error instanceof Error ? commitMutation.error.message : null

  async function handleCommit() {
    if (!sessionId || !message.trim() || staged.length === 0) return
    const msg = message.trim()
    setOpen(false)
    setMessage("")
    commitMutation.reset()
    try {
      await commitMutation.mutateAsync(msg)
    } catch {
      // error stored in commitMutation.error
    }
  }

  async function handleCommitAndPush() {
    if (!sessionId || !message.trim() || staged.length === 0) return
    const msg = message.trim()
    setOpen(false)
    setMessage("")
    commitMutation.reset()
    pushMutation.reset()
    try {
      await commitMutation.mutateAsync(msg)
    } catch {
      return
    }
    try {
      await pushMutation.mutateAsync()
    } catch {
      // error stored in pushMutation.error
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (nextOpen) {
      commitMutation.reset()
      pushMutation.reset()
    }
  }

  async function handleGenerate() {
    if (!sessionId || generating) return
    setGenerating(true)
    try {
      const promptTemplate = localStorage.getItem(COMMIT_PROMPT_STORAGE_KEY) ?? undefined
      const generated = await gitGenerateCommitMessage(sessionId, promptTemplate)
      setMessage(generated)
    } catch {
      // silently ignore — user still has the text field
    } finally {
      setGenerating(false)
    }
  }

  function handleConfigure() {
    setOpen(false)
    navigate({ to: "/settings" })
  }

  const committing = commitMutation.isPending
  const pushing = pushMutation.isPending
  const canCommit =
    !committing && !pushing && !generating && !!message.trim() && staged.length > 0 && !loading

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size="default"
            disabled={!sessionId || committing || pushing}
          />
        }
      >
        {committing || pushing ? (
          <Loader2 className="animate-spin" />
        ) : (
          <GitCommit />
        )}
        Commit
      </DialogTrigger>

      <DialogContent
        showCloseButton
        className="flex flex-col gap-0 bg-background p-0 sm:max-w-lg"
      >
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
          <GitCommit className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Commit changes</span>
        </div>

        {/* Files */}
        <div className="flex flex-col">
          {/* Staged */}
          <div>
            <div className="flex items-center justify-between bg-muted/30 px-3 py-1.5">
              <span className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
                Staged
              </span>
              {staged.length > 0 && (
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {staged.length}
                </span>
              )}
            </div>
            <div className="max-h-44 overflow-y-auto">
              {loading && (
                <div className="flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  Loading…
                </div>
              )}
              {!loading && staged.length === 0 && (
                <p className="px-3 py-2 text-xs text-muted-foreground/50">
                  No staged changes — stage files in the diff panel first.
                </p>
              )}
              {!loading &&
                sessionId &&
                staged.map((file, i) => (
                  <FileAccordionItem
                    key={i}
                    file={file}
                    sessionId={sessionId}
                  />
                ))}
            </div>
          </div>

          {/* Unstaged (if any) */}
          {unstaged.length > 0 && (
            <div className="border-t border-border/40">
              <div className="flex items-center justify-between bg-muted/30 px-3 py-1.5">
                <span className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
                  Not staged
                </span>
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {unstaged.length}
                </span>
              </div>
              <div className="max-h-28 overflow-y-auto">
                {sessionId &&
                  unstaged.map((file, i) => (
                    <FileAccordionItem
                      key={i}
                      file={file}
                      sessionId={sessionId}
                      dim
                    />
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Message */}
        <div className="flex flex-col border-t border-border/60">
          <div className="relative px-4 pt-3 pb-2">
            <AutoTextarea
              value={message}
              onChange={setMessage}
              placeholder="Summary (required)"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey))
                  handleCommit()
              }}
            />
            <div className="mt-1 flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                onClick={handleConfigure}
              >
                <Settings2 className="size-3" />
                Configure
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                disabled={generating || staged.length === 0}
                onClick={handleGenerate}
              >
                {generating ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Sparkles className="size-3" />
                )}
                {generating ? "Generating…" : "Generate message"}
              </Button>
            </div>
          </div>

          {error && (
            <p className="mx-4 mb-2 rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
              {error}
            </p>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-border/40 px-4 py-2.5">
            <p className="text-[11px] text-muted-foreground/50">
              {staged.length > 0
                ? `${staged.length} file${staged.length !== 1 ? "s" : ""} will be committed`
                : "Stage files to commit"}
            </p>
            <div className="flex items-center gap-2">
              {branch && (
                <div className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                  <GitBranch className="h-3 w-3" />
                  {branch}
                </div>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={handleCommitAndPush}
                disabled={!canCommit}
                className="h-7 px-3 text-xs"
              >
                {committing || pushing ? (
                  <Loader2 className="mr-1.5 size-3 animate-spin" />
                ) : (
                  <CloudUpload className="mr-1.5 size-3" />
                )}
                Commit & Push
              </Button>
              <Button
                size="sm"
                onClick={handleCommit}
                disabled={!canCommit}
                className="h-7 px-3 text-xs"
              >
                {committing ? (
                  <Loader2 className="mr-1.5 size-3 animate-spin" />
                ) : (
                  <GitCommit className="mr-1.5 size-3" />
                )}
                Commit
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
