import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
  memo,
  useId,
} from "react"
import {
  ChevronRight,
  GripVertical,
  Loader2,
  X,
  Columns2,
  AlignLeft,
  PackagePlus,
  PackageMinus,
  RefreshCw,
  Plus,
  Minus,
  MoreHorizontal,
  Archive,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { DiffView, type DiffMode } from "@/components/diff-view"
import { useDiffPanel } from "@/hooks/diff-panel-context"
import { cn } from "@/lib/utils"
import { useGitStatus } from "@/queries/use-git-status"
import { useGitStashList } from "@/queries/use-git-stash-list"
import { useGitFileDiff } from "@/queries/use-git-file-diff"
import { useGitStage } from "@/mutations/use-git-stage"
import { useGitStageAll } from "@/mutations/use-git-stage-all"
import { useGitStashMutations } from "@/mutations/use-git-stash"

const MIN_WIDTH = 300
const DEFAULT_WIDTH = 440

// ── Status helpers ──────────────────────────────────────────────────────────

interface ChangedFile {
  raw: string
  filePath: string
  isStaged: boolean
  isUntracked: boolean
}

function parseStatusLine(line: string): ChangedFile {
  const raw = line.slice(0, 2)
  const filePath = line.slice(3)
  const X = raw[0] ?? " "
  const isUntracked = raw.trim() === "??"
  const isStaged = !isUntracked && X !== " "
  return { raw, filePath, isStaged, isUntracked }
}

function statusLabel(file: ChangedFile): string {
  if (file.isUntracked) return "U"
  const X = file.raw[0] ?? " "
  const Y = file.raw[1] ?? " "
  if (X !== " " && Y !== " ") return "M*"
  if (X !== " ") return X
  return Y
}

function statusColor(file: ChangedFile) {
  const label = statusLabel(file)
  if (label === "M" || label === "M*") return "text-yellow-500 dark:text-yellow-400"
  if (label === "A") return "text-green-600 dark:text-green-400"
  if (label === "D") return "text-red-500 dark:text-red-400"
  if (label === "U") return "text-blue-500 dark:text-blue-400"
  if (label === "R") return "text-purple-500 dark:text-purple-400"
  return "text-muted-foreground"
}

// ── Stash list ──────────────────────────────────────────────────────────────

interface StashEntry {
  ref: string
  label: string
}

function parseStashList(raw: string): StashEntry[] {
  return raw
    .split("\n")
    .map((l) => l.trimEnd())
    .filter(Boolean)
    .map((l) => {
      const tab = l.indexOf("\t")
      if (tab === -1) return { ref: l, label: l }
      return { ref: l.slice(0, tab), label: l.slice(tab + 1) }
    })
}

// ── Stash input bar (VS Code style) ─────────────────────────────────────────

function StashInputBar({
  onConfirm,
  onCancel,
}: {
  onConfirm: (message: string) => Promise<void>
  onCancel: () => void
}) {
  const [message, setMessage] = useState("")
  const [stashing, setStashing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  async function handleConfirm() {
    if (stashing) return
    setStashing(true)
    try {
      await onConfirm(message.trim())
    } finally {
      setStashing(false)
    }
  }

  return (
    <div className="flex items-center gap-1.5 border-b border-border/60 bg-muted/30 px-3 py-2">
      <input
        ref={inputRef}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleConfirm()
          if (e.key === "Escape") onCancel()
        }}
        placeholder="Stash message (optional, Enter to confirm)"
        className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50"
      />
      {stashing ? (
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
      ) : (
        <Button
          variant="ghost"
          size="icon-sm"
          className="h-5 w-5 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={onCancel}
        >
          <X className="h-3 w-3" />
          <span className="sr-only">Cancel</span>
        </Button>
      )}
    </div>
  )
}

// ── File accordion item ─────────────────────────────────────────────────────

function FileAccordionItem({
  file,
  sessionId,
  mode,
  onStageToggle,
}: {
  file: ChangedFile
  sessionId: string
  mode: DiffMode
  onStageToggle: (file: ChangedFile) => Promise<void>
}) {
  const [expanded, setExpanded] = useState(false)
  const [toggling, setToggling] = useState(false)

  const { data: diff, isLoading: diffLoading } = useGitFileDiff(
    sessionId,
    file.filePath,
    file.raw,
    expanded,
  )

  async function handleToggle(e: React.MouseEvent) {
    e.stopPropagation()
    if (toggling) return
    setToggling(true)
    try {
      await onStageToggle(file)
    } finally {
      setToggling(false)
    }
  }

  const label = statusLabel(file)

  return (
    <div className="border-b border-border/40 last:border-0">
      <div className="flex w-full items-center gap-1 pr-1">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="ml-1 h-5 w-5 shrink-0 text-muted-foreground hover:text-foreground"
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
                <span className="sr-only">{file.isStaged ? "Unstage" : "Stage"}</span>
              </Button>
            }
          />
          <TooltipContent>{file.isStaged ? "Unstage file" : "Stage file"}</TooltipContent>
        </Tooltip>

        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex flex-1 items-center gap-1.5 py-2 pr-2 text-left transition-colors hover:bg-muted/40"
        >
          <ChevronRight
            className={cn(
              "size-3 shrink-0 text-muted-foreground transition-transform duration-150",
              expanded && "rotate-90"
            )}
          />
          <span className={cn("w-6 shrink-0 font-mono text-xs", statusColor(file))}>
            {label}
          </span>
          <span className="truncate font-mono text-xs text-foreground/80">
            {file.filePath}
          </span>
        </button>
      </div>

      {expanded && (
        <div className="border-t border-border/40 px-3 pb-3">
          {diffLoading ? (
            <div className="flex items-center gap-1.5 py-2 text-xs text-muted-foreground">
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
}

// ── Stash entry row ─────────────────────────────────────────────────────────

function StashEntryRow({
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
  const id = useId()

  async function run(action: "apply" | "pop" | "drop") {
    if (working) return
    setWorking(action)
    try {
      if (action === "apply") await onApply(entry.ref)
      else if (action === "pop") await onPop(entry.ref)
      else await onDrop(entry.ref)
    } finally {
      setWorking(null)
    }
  }

  // Strip the "WIP on branch:" prefix git adds automatically
  const displayLabel = entry.label.replace(/^On \S+: |^WIP on \S+: /, "")

  return (
    <div className="group flex items-center gap-1 py-1 pl-3 pr-1 hover:bg-muted/40">
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-foreground/80">{displayLabel}</p>
        <p className="font-mono text-[10px] text-muted-foreground/60">{entry.ref}</p>
      </div>

      {working ? (
        <Loader2 className="mr-1 h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100"
            aria-label={`Actions for ${id}`}
          >
            <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={() => run("apply")}>
              Apply stash
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => run("pop")}>
              Pop stash
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => run("drop")}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Drop stash
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}

// ── Stash section ───────────────────────────────────────────────────────────

function StashSection({ sessionId }: { sessionId: string }) {
  const [collapsed, setCollapsed] = useState(false)

  const { data: stashRaw, isLoading, refetch } = useGitStashList(sessionId)
  const { apply, pop, drop } = useGitStashMutations(sessionId)

  const stashes = useMemo(() => parseStashList(stashRaw ?? ""), [stashRaw])

  const handleApply = useCallback((ref: string) => apply.mutateAsync(ref), [apply])
  const handlePop = useCallback((ref: string) => pop.mutateAsync(ref), [pop])
  const handleDrop = useCallback((ref: string) => drop.mutateAsync(ref), [drop])

  return (
    <div className="shrink-0 border-t border-border/60">
      {/* Section header */}
      <div className="flex h-8 items-center gap-1 px-2">
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="flex flex-1 items-center gap-1 text-left"
        >
          <ChevronRight
            className={cn(
              "h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-150",
              !collapsed && "rotate-90"
            )}
          />
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Stashes
          </span>
          {stashes.length > 0 && (
            <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {stashes.length}
            </span>
          )}
        </button>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="h-5 w-5 text-muted-foreground"
                onClick={() => refetch()}
              >
                <RefreshCw className={cn("h-3 w-3", isLoading && "animate-spin")} />
                <span className="sr-only">Refresh</span>
              </Button>
            }
          />
          <TooltipContent>Refresh stashes</TooltipContent>
        </Tooltip>
      </div>

      {/* Stash entries */}
      {!collapsed && (
        <>
          {isLoading && stashes.length === 0 && (
            <div className="flex items-center gap-1.5 px-3 pb-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading…
            </div>
          )}
          {!isLoading && stashes.length === 0 && (
            <p className="px-3 pb-2 text-xs text-muted-foreground/50">No stashes</p>
          )}
          {stashes.map((s) => (
            <StashEntryRow
              key={s.ref}
              entry={s}
              onApply={handleApply}
              onPop={handlePop}
              onDrop={handleDrop}
            />
          ))}
        </>
      )}
    </div>
  )
}

// ── DiffPanel ───────────────────────────────────────────────────────────────

interface DiffPanelProps {
  sessionId: string
}

export const DiffPanel = memo(function DiffPanel({ sessionId }: DiffPanelProps) {
  const { close } = useDiffPanel()
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const [mode, setMode] = useState<DiffMode>("inline")
  const [stashInputOpen, setStashInputOpen] = useState(false)
  const dragStartRef = useRef<{ x: number; w: number } | null>(null)

  const { data: statusRaw, isLoading: loading, error: statusError, refetch } = useGitStatus(sessionId)
  const files = useMemo(
    () =>
      (statusRaw ?? "")
        .split("\n")
        .map((l) => l.trimEnd())
        .filter(Boolean)
        .map(parseStatusLine),
    [statusRaw]
  )
  const error = statusError instanceof Error ? statusError.message : null

  const { stage, unstage } = useGitStage(sessionId)
  const { stageAll, unstageAll } = useGitStageAll(sessionId)
  const { stash } = useGitStashMutations(sessionId)

  const bulkWorking = stageAll.isPending || unstageAll.isPending

  const handleStageToggle = useCallback(
    async (file: ChangedFile) => {
      if (file.isStaged) {
        await unstage.mutateAsync(file.filePath)
      } else {
        await stage.mutateAsync(file.filePath)
      }
    },
    [stage, unstage]
  )

  const handleStageAll = useCallback(async () => {
    await stageAll.mutateAsync()
  }, [stageAll])

  const handleUnstageAll = useCallback(async () => {
    await unstageAll.mutateAsync()
  }, [unstageAll])

  const handleStashConfirm = useCallback(
    async (message: string) => {
      await stash.mutateAsync(message || undefined)
      setStashInputOpen(false)
    },
    [stash]
  )

  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      dragStartRef.current = { x: e.clientX, w: width }

      const onMove = (ev: MouseEvent) => {
        if (!dragStartRef.current) return
        const delta = dragStartRef.current.x - ev.clientX
        setWidth(Math.max(MIN_WIDTH, dragStartRef.current.w + delta))
      }

      const onUp = () => {
        dragStartRef.current = null
        window.removeEventListener("mousemove", onMove)
        window.removeEventListener("mouseup", onUp)
      }

      window.addEventListener("mousemove", onMove)
      window.addEventListener("mouseup", onUp)
    },
    [width]
  )

  const stagedCount = files.filter((f) => f.isStaged).length
  const hasStaged = stagedCount > 0
  const hasUnstaged = files.some((f) => !f.isStaged)
  const hasChanges = files.length > 0

  return (
    <div
      className="relative flex h-full shrink-0 flex-col border-l bg-background"
      style={{ width }}
    >
      {/* Left-edge drag handle */}
      <div
        className="group absolute inset-y-0 left-0 flex w-1 cursor-col-resize items-center justify-center transition-colors hover:bg-border/60"
        onMouseDown={onDragStart}
      >
        <GripVertical className="h-4 w-3 text-muted-foreground/30 group-hover:text-muted-foreground/60" />
      </div>

      {/* Header */}
      <div className="flex h-9 min-w-0 shrink-0 items-center justify-between border-t border-b border-border/60 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-xs font-medium text-muted-foreground">
            Changes
          </span>
          {files.length > 0 && (
            <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {stagedCount}/{files.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Stage all */}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={handleStageAll}
                  disabled={bulkWorking || !hasUnstaged}
                >
                  {bulkWorking ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <PackagePlus className="h-3 w-3" />
                  )}
                  <span className="sr-only">Stage all</span>
                </Button>
              }
            />
            <TooltipContent>Stage all changes</TooltipContent>
          </Tooltip>

          {/* Unstage all */}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={handleUnstageAll}
                  disabled={bulkWorking || !hasStaged}
                >
                  <PackageMinus className="h-3 w-3" />
                  <span className="sr-only">Unstage all</span>
                </Button>
              }
            />
            <TooltipContent>Unstage all changes</TooltipContent>
          </Tooltip>

          <div className="mx-0.5 h-4 w-px bg-border/60" />

          {/* View mode */}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setMode("inline")}
                  data-active={mode === "inline"}
                  className="data-[active=true]:bg-accent data-[active=true]:text-accent-foreground"
                >
                  <AlignLeft className="h-3 w-3" />
                  <span className="sr-only">Inline view</span>
                </Button>
              }
            />
            <TooltipContent>Inline view</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setMode("side-by-side")}
                  data-active={mode === "side-by-side"}
                  className="data-[active=true]:bg-accent data-[active=true]:text-accent-foreground"
                >
                  <Columns2 className="h-3 w-3" />
                  <span className="sr-only">Side-by-side</span>
                </Button>
              }
            />
            <TooltipContent>Side-by-side view</TooltipContent>
          </Tooltip>

          <div className="mx-0.5 h-4 w-px bg-border/60" />

          {/* More actions (stash + refresh) */}
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger
                render={
                  <DropdownMenuTrigger className="flex h-6 w-6 items-center justify-center rounded-md border border-input bg-background text-muted-foreground shadow-xs hover:bg-accent hover:text-accent-foreground">
                    <MoreHorizontal className="h-3 w-3" />
                    <span className="sr-only">More actions</span>
                  </DropdownMenuTrigger>
                }
              />
              <TooltipContent>More actions</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem
                disabled={!hasChanges}
                onClick={() => setStashInputOpen(true)}
              >
                <Archive className="mr-2 h-3.5 w-3.5" />
                Stash all changes…
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => refetch()}>
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
                Refresh
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Close */}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button variant="ghost" size="icon-sm" onClick={close}>
                  <X className="h-3 w-3" />
                  <span className="sr-only">Close</span>
                </Button>
              }
            />
            <TooltipContent>Close</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* File list + stash input */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* VS Code-style stash message input bar */}
        {stashInputOpen && (
          <StashInputBar
            onConfirm={handleStashConfirm}
            onCancel={() => setStashInputOpen(false)}
          />
        )}

        {loading && files.length === 0 && (
          <div className="flex items-center gap-1.5 px-3 py-3 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            Loading…
          </div>
        )}
        {!loading && error && (
          <p className="px-3 py-3 text-xs text-destructive">{error}</p>
        )}
        {!loading && !error && files.length === 0 && (
          <p className="px-3 py-3 text-xs text-muted-foreground">No changes</p>
        )}
        {files.map((file, i) => (
          <FileAccordionItem
            key={i}
            file={file}
            sessionId={sessionId}
            mode={mode}
            onStageToggle={handleStageToggle}
          />
        ))}
      </div>

      {/* Stash section */}
      <StashSection sessionId={sessionId} />
    </div>
  )
})
