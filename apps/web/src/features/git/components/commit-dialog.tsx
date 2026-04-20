import { useState, useMemo, useRef, useEffect } from "react"
import {
  GitCommit,
  Loader2,
  ChevronRight,
  GitBranch,
  CloudUpload,
  Sparkles,
  Settings2,
  AlertCircle,
  FileText,
} from "lucide-react"
import { useSettingsModal } from "@/features/settings/context"
import { Button } from "@/shared/ui/button"
import { Dialog, DialogContent, DialogTrigger } from "@/shared/ui/dialog"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/shared/ui/tooltip"
import { ShortcutKbd } from "@/shared/ui/kbd"
import { useShortcutHandler, useShortcutBinding } from "@/shared/components/keyboard-shortcuts-provider"
import { SHORTCUT_ACTIONS } from "@/shared/lib/keyboard-shortcuts"
import { DiffView } from "./diff-view"
import { cn } from "@/shared/lib/utils"
import { useAppSettings } from "@/features/settings/queries"
import { APP_SETTINGS_KEYS } from "@/shared/lib/storage-keys"
import { useGitStatus } from "../queries"
import { useGitFileDiff } from "../queries"
import {
  useGenerateCommitMessage,
  useGitCommit,
  useGitPush,
} from "../mutations"
import { useBranch } from "../queries"

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

const STATUS_META: Record<string, { label: string; bg: string; text: string }> = {
  M: { label: "M", bg: "bg-yellow-500/15 dark:bg-yellow-400/10", text: "text-yellow-600 dark:text-yellow-400" },
  A: { label: "A", bg: "bg-green-500/15 dark:bg-green-400/10", text: "text-green-600 dark:text-green-400" },
  D: { label: "D", bg: "bg-red-500/15 dark:bg-red-400/10", text: "text-red-600 dark:text-red-400" },
  U: { label: "U", bg: "bg-blue-500/15 dark:bg-blue-400/10", text: "text-blue-600 dark:text-blue-400" },
  R: { label: "R", bg: "bg-purple-500/15 dark:bg-purple-400/10", text: "text-purple-600 dark:text-purple-400" },
}

function StatusBadge({ code }: { code: string }) {
  const c = statusChar(code)
  const meta = STATUS_META[c] ?? {
    label: c,
    bg: "bg-muted",
    text: "text-muted-foreground",
  }
  return (
    <span
      className={cn(
        "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] font-semibold leading-none",
        meta.bg,
        meta.text
      )}
    >
      {meta.label}
    </span>
  )
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
  const dirPath = pathParts.length > 1 ? pathParts.slice(0, -1).join("/") + "/" : null

  return (
    <div className={cn("group border-b border-border/30 last:border-0", dim && "opacity-40")}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <ChevronRight
          className={cn(
            "size-3 shrink-0 text-muted-foreground/50 transition-transform duration-150",
            expanded && "rotate-90"
          )}
        />
        <StatusBadge code={file.statusCode} />
        <span className="flex min-w-0 flex-1 items-baseline gap-1.5 overflow-hidden">
          <span className="shrink-0 text-xs font-medium text-foreground/85">{fileName}</span>
          {dirPath && (
            <span className="truncate font-mono text-[10px] text-muted-foreground/40">
              {dirPath}
            </span>
          )}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-border/30 bg-muted/10">
          {diffLoading ? (
            <div className="flex items-center gap-2 px-4 py-3 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              Loading diff…
            </div>
          ) : diff != null ? (
            <DiffView
              diff={diff}
              filePath={file.filePath}
              className="rounded-none border-x-0 border-b-0"
            />
          ) : (
            <div className="flex items-center gap-2 px-4 py-3 text-xs text-muted-foreground/60">
              <FileText className="size-3" />
              No diff available
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AutoTextarea({
  value,
  onChange,
  placeholder,
  className,
  onKeyDown,
  autoFocus,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  autoFocus?: boolean
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
      autoFocus={autoFocus}
      rows={3}
      className={cn(
        "w-full resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground/35",
        className
      )}
    />
  )
}

function SectionHeader({
  label,
  count,
}: {
  label: string
  count: number
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
        {label}
      </span>
      <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-muted px-1 text-[10px] font-medium text-muted-foreground">
        {count}
      </span>
    </div>
  )
}

export function CommitDialog({ sessionId }: CommitDialogProps) {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState("")
  const { openSettings } = useSettingsModal()
  const { data: settings } = useAppSettings()

  const { data: statusRaw, isLoading: loading } = useGitStatus(sessionId ?? "")
  const { data: branchData } = useBranch(sessionId ?? "")
  const commitMutation = useGitCommit(sessionId ?? "")
  const generateCommitMessageMutation = useGenerateCommitMessage(sessionId ?? "")
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

  const commitError =
    commitMutation.error instanceof Error ? commitMutation.error.message : null
  const pushError =
    pushMutation.error instanceof Error ? pushMutation.error.message : null
  const error = commitError ?? pushError

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
    if (!sessionId || generateCommitMessageMutation.isPending) return
    try {
      const promptTemplate =
        settings?.[APP_SETTINGS_KEYS.COMMIT_MESSAGE_PROMPT] ?? undefined
      const generated =
        await generateCommitMessageMutation.mutateAsync(promptTemplate)
      setMessage(generated)
    } catch {
      // silently ignore — user still has the text field
    }
  }

  function handleConfigure() {
    setOpen(false)
    openSettings()
  }

  const committing = commitMutation.isPending
  const generating = generateCommitMessageMutation.isPending
  const pushing = pushMutation.isPending

  useShortcutHandler(
    SHORTCUT_ACTIONS.OPEN_COMMIT_DIALOG,
    sessionId ? () => setOpen((v) => !v) : null
  )
  const commitBinding = useShortcutBinding(SHORTCUT_ACTIONS.OPEN_COMMIT_DIALOG)

  const canCommit =
    !committing &&
    !pushing &&
    !generating &&
    !!message.trim() &&
    staged.length > 0 &&
    !loading

  const hasUnstagedOnly = staged.length === 0 && unstaged.length > 0

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Tooltip>
        <TooltipTrigger
          render={
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
          }
        />
        <TooltipContent>
          Commit staged changes{" "}
          <ShortcutKbd binding={commitBinding} className="ml-1" />
        </TooltipContent>
      </Tooltip>

      <DialogContent
        showCloseButton
        className="flex flex-col gap-0 overflow-hidden bg-background p-0 sm:max-w-lg"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/50 px-4 py-3 pr-10">
          <div className="flex items-center gap-2.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-muted">
              <GitCommit className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <span className="text-sm font-semibold">Commit changes</span>
          </div>
          {branch && (
            <div className="flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/50 px-2.5 py-1 text-[11px] text-muted-foreground">
              <GitBranch className="h-3 w-3 shrink-0" />
              <span className="max-w-40 truncate font-mono">{branch}</span>
            </div>
          )}
        </div>

        {/* Files */}
        <div className="flex min-h-0 flex-1 flex-col divide-y divide-border/30">
          {/* Staged section */}
          <div className="flex flex-col">
            <SectionHeader label="Staged" count={staged.length} />

            <div className="max-h-48 overflow-y-auto">
              {loading && (
                <div className="flex items-center gap-2 px-4 py-3 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  Loading status…
                </div>
              )}

              {!loading && staged.length === 0 && (
                <div className="flex flex-col gap-1 px-4 py-3">
                  <p className="text-xs text-muted-foreground/70">
                    No staged files.
                  </p>
                  {hasUnstagedOnly && (
                    <p className="text-[11px] text-muted-foreground/45">
                      Stage files from the diff panel to include them in this commit.
                    </p>
                  )}
                </div>
              )}

              {!loading &&
                sessionId &&
                staged.map((file, i) => (
                  <FileAccordionItem key={i} file={file} sessionId={sessionId} />
                ))}
            </div>
          </div>

          {/* Unstaged section */}
          {unstaged.length > 0 && (
            <div className="flex flex-col">
              <SectionHeader label="Not staged" count={unstaged.length} />
              <div className="max-h-32 overflow-y-auto">
                {sessionId &&
                  unstaged.map((file, i) => (
                    <FileAccordionItem key={i} file={file} sessionId={sessionId} dim />
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Message input */}
        <div className="border-t border-border/50 px-4 pt-3 pb-2">
          <div
            className={cn(
              "rounded-lg border bg-muted/20 transition-colors",
              "border-border/50 focus-within:border-border focus-within:bg-muted/30"
            )}
          >
            <AutoTextarea
              value={message}
              onChange={setMessage}
              placeholder="Write a commit message…"
              autoFocus
              className="min-h-18 px-3 pt-2.5 pb-9"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleCommit()
              }}
            />

            {/* Inline toolbar */}
            <div className="flex items-center justify-between border-t border-border/30 px-2 py-1">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      onClick={handleConfigure}
                      className="flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-muted-foreground/50 transition-colors hover:bg-muted hover:text-muted-foreground"
                    >
                      <Settings2 className="size-3" />
                      Configure
                    </button>
                  }
                />
                <TooltipContent>Customize commit message prompt</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      onClick={handleGenerate}
                      disabled={generating || staged.length === 0}
                      className={cn(
                        "flex items-center gap-1.5 rounded px-1.5 py-1 text-[11px] transition-colors",
                        "text-muted-foreground/60 hover:bg-muted hover:text-foreground",
                        "disabled:pointer-events-none disabled:opacity-35"
                      )}
                    >
                      {generating ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Sparkles className="size-3" />
                      )}
                      {generating ? "Generating…" : "Generate"}
                    </button>
                  }
                />
                <TooltipContent>
                  {staged.length === 0
                    ? "Stage files first to generate a message"
                    : "Generate commit message from staged diff"}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-4 mb-2 flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/8 px-3 py-2 text-xs text-destructive">
            <AlertCircle className="mt-px size-3.5 shrink-0" />
            <span className="leading-snug">{error}</span>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border/40 px-4 py-2.5">
          <span className="text-[11px] text-muted-foreground/40">
            {staged.length > 0
              ? `${staged.length} file${staged.length === 1 ? "" : "s"} staged`
              : "Nothing staged"}
          </span>

          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCommitAndPush}
                    disabled={!canCommit}
                    className="h-7 gap-1.5 px-3 text-xs"
                  >
                    {pushing ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <CloudUpload className="size-3" />
                    )}
                    Commit & Push
                  </Button>
                }
              />
              <TooltipContent>Commit then push to remote</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="sm"
                    onClick={handleCommit}
                    disabled={!canCommit}
                    className="h-7 gap-1.5 px-3 text-xs"
                  >
                    {committing ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <GitCommit className="size-3" />
                    )}
                    Commit
                  </Button>
                }
              />
              <TooltipContent>
                Commit staged changes{" "}
                <ShortcutKbd binding="⌘↵" className="ml-1" />
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
