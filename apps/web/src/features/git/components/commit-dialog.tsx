import { useState, useMemo, useRef, useEffect } from "react"
import {
  GitCommit,
  Loader2,
  CloudUpload,
  Sparkles,
  Settings2,
  ChevronDown,
} from "lucide-react"
import { useSettingsModal } from "@/features/settings"
import { Alert, AlertDescription } from "@/shared/ui/alert"
import { Button } from "@/shared/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu"
import { Textarea } from "@/shared/ui/textarea"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/shared/ui/tooltip"
import { ShortcutKbd } from "@/shared/ui/kbd"
import { cn } from "@/shared/lib/utils"
import { useAppSettings } from "@/features/settings/queries"
import { APP_SETTINGS_KEYS } from "@/shared/lib/storage-keys"
import { useGitStatus, useAheadBehind } from "../queries"
import {
  useGenerateCommitMessage,
  useGitCommit,
  useGitPush,
} from "../mutations"

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
    <Textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      rows={2}
      className={cn("resize-none border-0 bg-transparent shadow-none focus-visible:ring-0", className)}
    />
  )
}

// ─── Workflow action button ───────────────────────────────────────────────────
//
// Step 1 – staged files exist → split [Commit] [▾ Commit & Push]
// Step 2 – nothing staged but ahead > 0 → [Push N commits]
// Otherwise → disabled commit button

function WorkflowButton({
  staged,
  ahead,
  canCommit,
  committing,
  pushing,
  onCommit,
  onCommitAndPush,
  onPush,
}: {
  staged: number
  ahead: number | null
  canCommit: boolean
  committing: boolean
  pushing: boolean
  onCommit: () => void
  onCommitAndPush: () => void
  onPush: () => void
}) {
  const busy = committing || pushing

  // Step 2: nothing to commit, but unpushed commits exist → show Push
  if (staged === 0 && (ahead ?? 0) > 0) {
    const aheadCount = ahead ?? 0
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="sm"
              onClick={onPush}
              disabled={busy}
              className="h-7 gap-1.5 px-3 text-xs"
            >
              {pushing ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <CloudUpload className="size-3" />
              )}
              Push {aheadCount > 0 ? `${aheadCount} commit${aheadCount === 1 ? "" : "s"}` : ""}
            </Button>
          }
        />
        <TooltipContent>Push committed changes to remote</TooltipContent>
      </Tooltip>
    )
  }

  // Step 1: staged files → split commit button
  return (
    <div className="flex items-center">
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="sm"
              onClick={onCommit}
              disabled={!canCommit}
              className="h-7 gap-1.5 rounded-r-none px-3 text-xs"
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

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              size="sm"
              disabled={!canCommit}
              className="h-7 rounded-l-none border-l border-l-primary-foreground/20 px-1.5 text-xs"
            >
              <ChevronDown className="size-3" />
              <span className="sr-only">More commit options</span>
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem
            onClick={onCommitAndPush}
            disabled={!canCommit}
            className="flex items-center gap-2"
          >
            {pushing ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <CloudUpload className="size-3.5" />
            )}
            Commit & Push
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

// ─── CommitInputSection ───────────────────────────────────────────────────────

export function CommitInputSection({ sessionId }: { sessionId: string }) {
  const [message, setMessage] = useState("")
  const { openSettings } = useSettingsModal()
  const { data: settings } = useAppSettings()

  const { data: statusData, isLoading: loading } = useGitStatus(sessionId)
  const statusRaw = statusData?.raw ?? ""
  const { data: aheadBehind } = useAheadBehind(sessionId)
  const ahead = aheadBehind?.ahead ?? null

  const commitMutation = useGitCommit(sessionId)
  const generateCommitMessageMutation = useGenerateCommitMessage(sessionId)
  const pushMutation = useGitPush(sessionId)

  const staged = useMemo(() => {
    if (!statusRaw) return []
    return statusRaw
      .split("\n")
      .map((l) => l.trimEnd())
      .filter(Boolean)
      .map(parseFile)
      .filter((f) => f.isStaged)
  }, [statusRaw])

  const commitError = commitMutation.error instanceof Error ? commitMutation.error.message : null
  const pushError = pushMutation.error instanceof Error ? pushMutation.error.message : null
  const error = commitError ?? pushError

  async function handleCommit() {
    if (!message.trim() || staged.length === 0) return
    const msg = message.trim()
    setMessage("")
    commitMutation.reset()
    try {
      await commitMutation.mutateAsync(msg)
    } catch {}
  }

  async function handleCommitAndPush() {
    if (!message.trim() || staged.length === 0) return
    const msg = message.trim()
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
    } catch {}
  }

  async function handlePush() {
    pushMutation.reset()
    try {
      await pushMutation.mutateAsync()
    } catch {}
  }

  async function handleGenerate() {
    if (generateCommitMessageMutation.isPending) return
    try {
      const promptTemplate = settings?.[APP_SETTINGS_KEYS.COMMIT_MESSAGE_PROMPT] ?? undefined
      const generated = await generateCommitMessageMutation.mutateAsync(promptTemplate)
      setMessage(generated)
    } catch {}
  }

  const committing = commitMutation.isPending
  const generating = generateCommitMessageMutation.isPending
  const pushing = pushMutation.isPending

  const canCommit =
    !committing && !pushing && !generating && !!message.trim() && staged.length > 0 && !loading

  return (
    <div className="shrink-0 border-b border-border/50 p-2">
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
          className="px-3 pt-2 pb-1 text-xs"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleCommit()
          }}
        />

        <div className="flex items-center justify-between border-t border-border/30 px-2 py-1">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={openSettings}
                  className="gap-1 text-[11px] text-muted-foreground"
                >
                  <Settings2 />
                  Configure
                </Button>
              }
            />
            <TooltipContent>Customize commit message prompt</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={handleGenerate}
                  disabled={generating || staged.length === 0}
                  className="gap-1.5 text-[11px] text-muted-foreground"
                >
                  {generating ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Sparkles />
                  )}
                  {generating ? "Generating…" : "Generate"}
                </Button>
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

      {error && (
        <Alert variant="destructive" className="mt-2">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="mt-2 flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">
          {staged.length > 0
            ? `${staged.length} file${staged.length === 1 ? "" : "s"} staged`
            : (ahead ?? 0) > 0
            ? `${ahead} commit${ahead === 1 ? "" : "s"} ahead`
            : "Nothing staged"}
        </span>

        <WorkflowButton
          staged={staged.length}
          ahead={ahead}
          canCommit={canCommit}
          committing={committing}
          pushing={pushing}
          onCommit={handleCommit}
          onCommitAndPush={handleCommitAndPush}
          onPush={handlePush}
        />
      </div>
    </div>
  )
}
