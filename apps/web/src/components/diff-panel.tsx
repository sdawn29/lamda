import { useCallback, useEffect, useRef, useState, memo } from "react"
import {
  ChevronRight,
  GripVertical,
  Loader2,
  X,
  Columns2,
  AlignLeft,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { DiffView, type DiffMode } from "@/components/diff-view"
import { useDiffPanel } from "@/hooks/diff-panel-context"
import { cn } from "@/lib/utils"

const MIN_WIDTH = 280
const DEFAULT_WIDTH = 420

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
  cwd,
  mode,
}: {
  file: ChangedFile
  cwd: string
  mode: DiffMode
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
    <div className="border-b border-border/40 last:border-0">
      <button
        onClick={toggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/40"
      >
        <ChevronRight
          className={cn(
            "size-3 shrink-0 text-muted-foreground transition-transform duration-150",
            expanded && "rotate-90"
          )}
        />
        <span
          className={cn(
            "w-5 shrink-0 font-mono text-xs",
            statusColor(file.statusCode)
          )}
        >
          {file.statusCode.trim()}
        </span>
        <span className="truncate font-mono text-xs text-foreground/80">
          {file.filePath}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-border/40 px-3 pb-3">
          {diffLoading ? (
            <div className="flex items-center gap-1.5 py-2 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              Loading diff…
            </div>
          ) : diff !== null ? (
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

interface DiffPanelProps {
  cwd: string
}

export const DiffPanel = memo(function DiffPanel({ cwd }: DiffPanelProps) {
  const { close } = useDiffPanel()
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const [mode, setMode] = useState<DiffMode>("inline")
  const [files, setFiles] = useState<ChangedFile[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dragStartRef = useRef<{ x: number; w: number } | null>(null)

  useEffect(() => {
    if (!cwd) return
    setLoading(true)
    setError(null)
    window.electronAPI
      ?.gitStatus(cwd)
      .then((out) => {
        const parsed = out
          .split("\n")
          .map((l) => l.trimEnd())
          .filter(Boolean)
          .map((l) => ({
            statusCode: l.slice(0, 2) === "??" ? "U" : l.slice(0, 2),
            filePath: l.slice(3),
          }))
        setFiles(parsed)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [cwd])

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
            Diff
          </span>
          {files.length > 0 && (
            <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {files.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setMode("inline")}
            title="Inline view"
          >
            <AlignLeft className="h-3 w-3" />
            <span className="sr-only">Inline view</span>
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setMode("side-by-side")}
            title="Side-by-side view"
          >
            <Columns2 className="h-3 w-3" />
            <span className="sr-only">Side-by-side view</span>
          </Button>

          <div className="mx-1 h-4 w-px bg-border/60" />

          <Button variant="outline" size="icon-sm" onClick={close}>
            <X className="h-3 w-3" />
            <span className="sr-only">Close diff panel</span>
          </Button>
        </div>
      </div>

      {/* File list */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && (
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
        {!loading &&
          files.map((file, i) => (
            <FileAccordionItem key={i} file={file} cwd={cwd} mode={mode} />
          ))}
      </div>
    </div>
  )
})
