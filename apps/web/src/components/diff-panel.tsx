import { useCallback, useEffect, useRef, useState, useMemo, memo } from "react"
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
  Archive,
  Trash2,
  GitBranch,
  PackageOpen,
  Download,
  ArrowUpDown,
  Check,
  Undo2,
  GitCompare,
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
import { useGitRevertFile } from "@/mutations/use-git-revert-file"

const MIN_WIDTH = 300
const DEFAULT_WIDTH = 440
const MIN_CHAT_WIDTH = 200

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
  if (label === "M" || label === "M*")
    return "text-yellow-500 dark:text-yellow-400"
  if (label === "A") return "text-green-600 dark:text-green-400"
  if (label === "D") return "text-red-500 dark:text-red-400"
  if (label === "U") return "text-blue-500 dark:text-blue-400"
  if (label === "R") return "text-purple-500 dark:text-purple-400"
  return "text-muted-foreground"
}

// ── Stash list ──────────────────────────────────────────────────────────────

interface StashEntry {
  ref: string
  index: number
  branch: string
  message: string
}

function parseStashList(raw: string): StashEntry[] {
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

      // "On branch: msg" or "WIP on branch: msg"
      const branchMatch = rest.match(/^(?:WIP )?[Oo]n ([^:]+):?\s*(.*)/)
      const branch = branchMatch?.[1]?.trim() ?? ""
      const message = branchMatch?.[2]?.trim() || rest

      return { ref, index, branch, message: message || "WIP changes" }
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
  onRevert,
}: {
  file: ChangedFile
  sessionId: string
  mode: DiffMode
  onStageToggle: (file: ChangedFile) => Promise<void>
  onRevert: (file: ChangedFile) => Promise<void>
}) {
  const [expanded, setExpanded] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [reverting, setReverting] = useState(false)

  const { data: diff, isLoading: diffLoading } = useGitFileDiff(
    sessionId,
    file.filePath,
    file.raw,
    expanded
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

  async function handleRevert(e: React.MouseEvent) {
    e.stopPropagation()
    if (reverting) return
    setReverting(true)
    try {
      await onRevert(file)
    } finally {
      setReverting(false)
    }
  }

  const label = statusLabel(file)
  const pathParts = file.filePath.split("/")
  const fileName = pathParts[pathParts.length - 1] ?? file.filePath
  const dirPath = pathParts.length > 1 ? pathParts.slice(0, -1).join("/") : null

  return (
    <div className="group/file border-b border-border/40 last:border-0">
      <div className="relative flex w-full items-center">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-1.5 py-2 pr-8 pl-2 text-left transition-colors hover:bg-muted/40"
        >
          <ChevronRight
            className={cn(
              "size-3 shrink-0 text-muted-foreground transition-transform duration-150",
              expanded && "rotate-90"
            )}
          />
          <span
            className={cn("w-6 shrink-0 font-mono text-xs", statusColor(file))}
          >
            {label}
          </span>
          <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
            <span className="shrink-0 font-mono text-xs text-foreground/90">
              {fileName}
            </span>
            {dirPath && (
              <span className="truncate font-mono text-[10px] text-muted-foreground/50">
                {dirPath}
              </span>
            )}
          </span>
        </button>

        <div className="absolute top-1/2 right-1 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity group-hover/file:opacity-100">
          {!file.isUntracked && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                    disabled={reverting}
                    onClick={handleRevert}
                  >
                    {reverting ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Undo2 className="h-3 w-3" />
                    )}
                    <span className="sr-only">Revert changes</span>
                  </Button>
                }
              />
              <TooltipContent>Revert changes</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
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
                  <span className="sr-only">
                    {file.isStaged ? "Unstage" : "Stage"}
                  </span>
                </Button>
              }
            />
            <TooltipContent>
              {file.isStaged ? "Unstage file" : "Stage file"}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {expanded && (
        <div className="animate-in border-t border-border/40 px-3 pb-3 duration-150 fade-in-0 slide-in-from-top-1">
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

  return (
    <div className="group flex items-start gap-2.5 px-3 py-2 hover:bg-muted/40">
      {/* Index badge + icon */}
      <div className="relative mt-0.5 shrink-0">
        <Archive className="h-3.5 w-3.5 text-muted-foreground/50" />
        <span className="absolute -top-1.5 -right-1.5 flex h-3 min-w-3 items-center justify-center rounded-full bg-muted px-0.5 text-[8px] font-semibold text-muted-foreground">
          {entry.index}
        </span>
      </div>

      {/* Label + branch */}
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

      {/* Actions */}
      {working ? (
        <Loader2 className="mt-0.5 h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
      ) : (
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="h-5 w-5 text-muted-foreground hover:text-foreground"
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
                  className="h-5 w-5 text-muted-foreground hover:text-foreground"
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
                  className="h-5 w-5 text-destructive/60 hover:text-destructive"
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
}

// ── Stash section ───────────────────────────────────────────────────────────

function StashSection({ sessionId }: { sessionId: string }) {
  const [collapsed, setCollapsed] = useState(false)

  const { data: stashRaw, isLoading } = useGitStashList(sessionId)
  const { apply, pop, drop } = useGitStashMutations(sessionId)

  const stashes = useMemo(() => parseStashList(stashRaw ?? ""), [stashRaw])

  const handleApply = useCallback(
    (ref: string) => apply.mutateAsync(ref),
    [apply]
  )
  const handlePop = useCallback((ref: string) => pop.mutateAsync(ref), [pop])
  const handleDrop = useCallback((ref: string) => drop.mutateAsync(ref), [drop])

  return (
    <div className="shrink-0 border-t border-border/60">
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="flex w-full items-center gap-1.5 bg-muted/30 px-2 py-1.5 text-left transition-colors duration-150 hover:bg-muted/60"
      >
        <ChevronRight
          className={cn(
            "h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-150",
            !collapsed && "rotate-90"
          )}
        />
        <Archive className="h-3 w-3 shrink-0 text-muted-foreground/60" />
        <span className="flex-1 text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
          Stashes
        </span>
        {isLoading && (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/50" />
        )}
        {!isLoading && stashes.length > 0 && (
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {stashes.length}
          </span>
        )}
      </button>

      {!collapsed && (
        <div className="animate-in duration-150 fade-in-0 slide-in-from-top-1">
          {!isLoading && stashes.length === 0 && (
            <p className="px-4 py-2.5 text-xs text-muted-foreground/40">
              No stashes
            </p>
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
        </div>
      )}
    </div>
  )
}

// ── Files section ───────────────────────────────────────────────────────────

function FilesSection({
  label,
  files,
  sessionId,
  mode,
  onStageToggle,
  onRevert,
  emptyText,
}: {
  label: string
  files: ChangedFile[]
  sessionId: string
  mode: DiffMode
  onStageToggle: (file: ChangedFile) => Promise<void>
  onRevert: (file: ChangedFile) => Promise<void>
  emptyText?: string
}) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="border-b border-border/40 last:border-0">
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="flex w-full items-center gap-1.5 bg-muted/30 px-2 py-1.5 text-left transition-colors duration-150 hover:bg-muted/60"
      >
        <ChevronRight
          className={cn(
            "h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-150",
            !collapsed && "rotate-90"
          )}
        />
        <span className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
          {label}
        </span>
        {files.length > 0 && (
          <span className="ml-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {files.length}
          </span>
        )}
      </button>

      {!collapsed && (
        <div className="animate-in duration-150 fade-in-0 slide-in-from-top-1">
          {files.length === 0 && emptyText && (
            <p className="px-3 py-2 text-xs text-muted-foreground/50">
              {emptyText}
            </p>
          )}
          {files.map((file, i) => (
            <FileAccordionItem
              key={i}
              file={file}
              sessionId={sessionId}
              mode={mode}
              onStageToggle={onStageToggle}
              onRevert={onRevert}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Sort ────────────────────────────────────────────────────────────────────

type SortMode = "name" | "name-desc" | "status" | "path"

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "name", label: "Name (A → Z)" },
  { value: "name-desc", label: "Name (Z → A)" },
  { value: "status", label: "Status" },
  { value: "path", label: "Path" },
]

const STATUS_ORDER: Record<string, number> = { A: 0, M: 1, R: 2, D: 3, U: 4 }

function applySortMode(files: ChangedFile[], sort: SortMode): ChangedFile[] {
  const sorted = [...files]
  switch (sort) {
    case "name":
      return sorted.sort((a, b) => {
        const na = a.filePath.split("/").pop() ?? a.filePath
        const nb = b.filePath.split("/").pop() ?? b.filePath
        return na.localeCompare(nb)
      })
    case "name-desc":
      return sorted.sort((a, b) => {
        const na = a.filePath.split("/").pop() ?? a.filePath
        const nb = b.filePath.split("/").pop() ?? b.filePath
        return nb.localeCompare(na)
      })
    case "status":
      return sorted.sort((a, b) => {
        const la = statusLabel(a)
        const lb = statusLabel(b)
        return (
          (STATUS_ORDER[la] ?? 5) - (STATUS_ORDER[lb] ?? 5) ||
          a.filePath.localeCompare(b.filePath)
        )
      })
    case "path":
      return sorted.sort((a, b) => a.filePath.localeCompare(b.filePath))
  }
}

// ── DiffPanel ───────────────────────────────────────────────────────────────

interface DiffPanelProps {
  sessionId: string
}

export const DiffPanel = memo(function DiffPanel({
  sessionId,
}: DiffPanelProps) {
  const { close } = useDiffPanel()
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const [mode, setMode] = useState<DiffMode>("inline")
  const [sortMode, setSortMode] = useState<SortMode>("name")
  const [stashInputOpen, setStashInputOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const dragStartRef = useRef<{ x: number; w: number } | null>(null)

  const {
    data: statusRaw,
    isLoading: loading,
    error: statusError,
    refetch,
  } = useGitStatus(sessionId)
  const { staged, unstaged } = useMemo(() => {
    const all = (statusRaw ?? "")
      .split("\n")
      .map((l) => l.trimEnd())
      .filter(Boolean)
      .map(parseStatusLine)
    return {
      staged: applySortMode(
        all.filter((f) => f.isStaged),
        sortMode
      ),
      unstaged: applySortMode(
        all.filter((f) => !f.isStaged),
        sortMode
      ),
    }
  }, [statusRaw, sortMode])
  const files = useMemo(() => [...staged, ...unstaged], [staged, unstaged])
  const error = statusError instanceof Error ? statusError.message : null

  const { stage, unstage } = useGitStage(sessionId)
  const { stageAll, unstageAll } = useGitStageAll(sessionId)
  const { stash } = useGitStashMutations(sessionId)
  const revertFile = useGitRevertFile(sessionId)

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

  const handleRevert = useCallback(
    async (file: ChangedFile) => {
      await revertFile.mutateAsync({ filePath: file.filePath, raw: file.raw })
    },
    [revertFile]
  )

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
      document.body.style.userSelect = "none"
      document.body.style.cursor = "col-resize"

      const onMove = (ev: MouseEvent) => {
        if (!dragStartRef.current) return
        const delta = dragStartRef.current.x - ev.clientX
        const parentWidth =
          panelRef.current?.parentElement?.clientWidth ?? window.innerWidth
        const maxWidth = parentWidth - MIN_CHAT_WIDTH
        setWidth(
          Math.max(
            MIN_WIDTH,
            Math.min(maxWidth, dragStartRef.current.w + delta)
          )
        )
      }

      const onUp = () => {
        dragStartRef.current = null
        document.body.style.userSelect = ""
        document.body.style.cursor = ""
        window.removeEventListener("mousemove", onMove)
        window.removeEventListener("mouseup", onUp)
      }

      window.addEventListener("mousemove", onMove)
      window.addEventListener("mouseup", onUp)
    },
    [width]
  )

  const stagedCount = staged.length
  const hasStaged = stagedCount > 0
  const hasUnstaged = unstaged.length > 0
  const hasChanges = files.length > 0

  return (
    <div
      ref={panelRef}
      className="relative flex h-full shrink-0 flex-col border-l bg-background"
      style={{ width, maxWidth: "80%" }}
    >
      {/* Left-edge drag handle */}
      <div
        className="group absolute inset-y-0 left-0 flex w-2 cursor-col-resize items-center justify-center transition-[background-color,width] duration-150 hover:w-2 hover:bg-border/40"
        onMouseDown={onDragStart}
      >
        <GripVertical className="h-4 w-3 text-muted-foreground/20 transition-[color,opacity] duration-150 group-hover:text-muted-foreground/70" />
      </div>

      {/* Header – Row 1: title + status badges + refresh + close */}
      <div className="flex h-10 min-w-0 shrink-0 items-center gap-2 border-b border-border/60 pr-2 pl-4">
        <GitCompare className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
        <span className="text-xs font-semibold tracking-wide">
          Source Control
        </span>
        <div className="flex flex-1 items-center justify-end gap-1">
          {hasStaged && (
            <span className="rounded-full bg-green-500/10 px-1.5 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400">
              {stagedCount} staged
            </span>
          )}
          {unstaged.length > 0 && (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {unstaged.length} changed
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => refetch()}
                  className="h-6 w-6 text-muted-foreground"
                >
                  <RefreshCw className="h-3 w-3" />
                  <span className="sr-only">Refresh</span>
                </Button>
              }
            />
            <TooltipContent>Refresh</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={close}
                  className="h-6 w-6"
                >
                  <X className="h-3 w-3" />
                  <span className="sr-only">Close panel</span>
                </Button>
              }
            />
            <TooltipContent>Close panel</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Header – Row 2: action toolbar */}
      <div className="flex h-8 min-w-0 shrink-0 items-center gap-0.5 border-b border-border/60 bg-muted/20 px-2">
        {/* Stage / unstage all */}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleStageAll}
                disabled={bulkWorking || !hasUnstaged}
                className="h-6 w-6"
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

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleUnstageAll}
                disabled={bulkWorking || !hasStaged}
                className="h-6 w-6"
              >
                <PackageMinus className="h-3 w-3" />
                <span className="sr-only">Unstage all</span>
              </Button>
            }
          />
          <TooltipContent>Unstage all changes</TooltipContent>
        </Tooltip>

        <div className="mx-1 h-4 w-px bg-border/60" />

        {/* View mode */}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setMode("inline")}
                data-active={mode === "inline"}
                className="h-6 w-6 data-[active=true]:bg-accent data-[active=true]:text-accent-foreground"
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
                className="h-6 w-6 data-[active=true]:bg-accent data-[active=true]:text-accent-foreground"
              >
                <Columns2 className="h-3 w-3" />
                <span className="sr-only">Side-by-side</span>
              </Button>
            }
          />
          <TooltipContent>Side-by-side view</TooltipContent>
        </Tooltip>

        <div className="mx-1 h-4 w-px bg-border/60" />

        {/* Sort */}
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger
              render={
                <DropdownMenuTrigger
                  className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground data-[active=true]:bg-accent data-[active=true]:text-accent-foreground"
                  data-active={sortMode !== "name"}
                >
                  <ArrowUpDown className="h-3 w-3" />
                  <span className="sr-only">Sort files</span>
                </DropdownMenuTrigger>
              }
            />
            <TooltipContent>Sort files</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="w-44">
            {SORT_OPTIONS.map((opt) => (
              <DropdownMenuItem
                key={opt.value}
                onClick={() => setSortMode(opt.value)}
                className="flex items-center justify-between"
              >
                {opt.label}
                {sortMode === opt.value && (
                  <Check className="ml-2 h-3 w-3 text-muted-foreground" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="mx-1 h-4 w-px bg-border/60" />

        {/* Stash */}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setStashInputOpen(true)}
                disabled={!hasChanges}
                className="h-6 w-6"
              >
                <Archive className="h-3 w-3" />
                <span className="sr-only">Stash changes</span>
              </Button>
            }
          />
          <TooltipContent>Stash all changes</TooltipContent>
        </Tooltip>
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

        {/* Staged section */}
        {!loading && !error && (staged.length > 0 || unstaged.length > 0) && (
          <FilesSection
            label="Staged"
            files={staged}
            sessionId={sessionId}
            mode={mode}
            onStageToggle={handleStageToggle}
            onRevert={handleRevert}
            emptyText="No staged changes"
          />
        )}

        {/* Unstaged section */}
        {!loading && !error && unstaged.length > 0 && (
          <FilesSection
            label="Changes"
            files={unstaged}
            sessionId={sessionId}
            mode={mode}
            onStageToggle={handleStageToggle}
            onRevert={handleRevert}
          />
        )}
      </div>

      {/* Stash section */}
      <StashSection sessionId={sessionId} />
    </div>
  )
})
