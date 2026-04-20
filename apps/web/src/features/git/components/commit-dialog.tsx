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
          <span className="shrink-0 text-xs text-foreground/90">{fileName}</span>
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
        "w-full resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground/40",
        className
      )}
    />
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

  const hasFiles = staged.length > 0 || unstaged.length > 0

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
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3 pr-10">
          <div className="flex items-center gap-2">
            <GitCommit className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Commit changes</span>
          </div>
          {branch && (
            <div className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">
              <GitBranch className="h-3 w-3 shrink-0" />
              <span className="max-w-45 truncate">{branch}</span>
            </div>
          )}
        </div>

        {/* Files */}
        <div className="flex flex-col">
          {/* Staged section */}
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
                <div className="flex items-center gap-1.5 px-3 py-3 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  Loading…
                </div>
              )}
              {!loading && staged.length === 0 && (
                <div className="flex flex-col gap-0.5 px-3 py-3">
                  <p className="text-xs text-muted-foreground/60">
                    No files staged yet.
                  </p>
                  {hasFiles && (
                    <p className="text-[11px] text-muted-foreground/40">
                      Stage files from the diff panel to include them here.
                    </p>
                  )}
                </div>
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

          {/* Unstaged section */}
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

        {/* Message input */}
        <div className="border-t border-border/60 px-4 pt-3 pb-2">
          <div className="relative rounded-lg border border-border/60 bg-muted/20 focus-within:border-border/80 focus-within:bg-muted/30 transition-colors">
            <AutoTextarea
              value={message}
              onChange={setMessage}
              placeholder="Commit message…"
              autoFocus
              className="px-3 pt-2.5 pb-8 min-h-20"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey))
                  handleCommit()
              }}
            />
            {/* Toolbar inside textarea card */}
            <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-2 py-1.5 border-t border-border/40">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      onClick={handleConfigure}
                      className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground/50 transition-colors hover:bg-muted hover:text-muted-foreground"
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
                      className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
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
                    ? "Stage files first"
                    : "Generate commit message from staged diff"}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-4 mb-2 rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border/40 px-4 py-2.5">
          <Button
            size="sm"
            variant="outline"
            onClick={handleCommitAndPush}
            disabled={!canCommit}
            className="h-7 gap-1.5 px-3 text-xs"
          >
            {committing || pushing ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <CloudUpload className="size-3" />
            )}
            Commit & Push
          </Button>
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
              Commit staged changes <ShortcutKbd binding="⌘↵" className="ml-1" />
            </TooltipContent>
          </Tooltip>
        </div>
      </DialogContent>
    </Dialog>
  )
}
