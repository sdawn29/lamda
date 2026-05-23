import { memo, useCallback, useState } from "react"
import { Minus, Plus, Undo2 } from "lucide-react"
import { Icon } from "@iconify/react"
import { getIconName } from "@/shared/ui/file-icon"
import { LoadingSpinner } from "@/shared/ui/loading-spinner"
import { IconButtonWithTooltip } from "@/shared/ui/icon-button-with-tooltip"
import { DiffView, type DiffMode } from "./diff-view"
import { StatusBadge, type ChangedFile } from "./status-badge"
import { DiffStat, parseDiffCounts } from "./diff-stat"
import { useGitFileDiff, useGitShowFileDiff } from "../queries"
import { cn } from "@/shared/lib/utils"

interface FileListItemProps {
  file: ChangedFile
  sessionId: string
  /** Controlled expanded state */
  expanded?: boolean
  /** Callback when user toggles expand */
  onExpandedChange?: (expanded: boolean) => void
  /** Diff view mode - if provided, item is expandable with diff preview */
  mode?: DiffMode
  /** Called when user clicks to expand (if not using controlled expanded) */
  onExpand?: () => void
  /** Called when user clicks the item (general click handler) */
  onClick?: (file: ChangedFile) => void
  /** Show stage/revert actions */
  showActions?: boolean
  onStage?: (file: ChangedFile) => Promise<void>
  onRevert?: (file: ChangedFile) => Promise<void>
  /** Disable the entire row */
  disabled?: boolean
  /** Additional classes for the row container */
  className?: string
  /** When set, fetches diff from the given commit SHA instead of the working tree */
  sha?: string
  /** Pre-fetched diff counts — shown immediately without waiting for the diff to load */
  counts?: { added: number; removed: number }
}

export const FileListItem = memo(function FileListItem({
  file,
  sessionId,
  expanded: controlledExpanded,
  onExpandedChange,
  mode,
  onClick,
  showActions = false,
  onStage,
  onRevert,
  disabled = false,
  className,
  sha,
  counts: preloadedCounts,
}: FileListItemProps) {
  // Internal state for uncontrolled mode
  const [internalExpanded, setInternalExpanded] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [reverting, setReverting] = useState(false)

  // Use controlled or uncontrolled expanded state
  const isExpanded =
    controlledExpanded !== undefined ? controlledExpanded : internalExpanded

  const isExpandable = mode !== undefined
  const isCommitMode = !!sha

  const { data: workDiff, isLoading: workDiffLoading } = useGitFileDiff(
    sessionId,
    file.filePath,
    file.raw,
    !isCommitMode
  )
  const { data: commitDiff, isLoading: commitDiffLoading } = useGitShowFileDiff(
    sessionId,
    sha ?? "",
    file.filePath,
    isCommitMode && isExpanded
  )

  const diff = isCommitMode ? commitDiff : workDiff
  const diffLoading = isCommitMode ? commitDiffLoading : workDiffLoading
  const counts = preloadedCounts ?? (diff != null ? parseDiffCounts(diff) : null)

  const handleToggle = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation()
      if (toggling || !onStage) return
      setToggling(true)
      try {
        await onStage(file)
      } finally {
        setToggling(false)
      }
    },
    [toggling, onStage, file]
  )

  const handleRevertClick = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation()
      if (reverting || !onRevert) return
      setReverting(true)
      try {
        await onRevert(file)
      } finally {
        setReverting(false)
      }
    },
    [reverting, onRevert, file]
  )

  const handleMainClick = useCallback(() => {
    if (disabled) return
    if (isExpandable) {
      if (onExpandedChange) {
        onExpandedChange(!isExpanded)
      } else {
        setInternalExpanded(!isExpanded)
      }
    }
    onClick?.(file)
  }, [disabled, isExpandable, isExpanded, onExpandedChange, onClick, file])

  const pathParts = file.filePath.split("/")
  const fileName = pathParts[pathParts.length - 1] ?? file.filePath
  const dirPath =
    pathParts.length > 1 ? pathParts.slice(0, -1).join("/") + "/" : null

  return (
    <div className={cn("group/file", className)}>
      <div className="flex w-full items-center transition-colors hover:bg-muted/30">
        <button
          onClick={handleMainClick}
          disabled={disabled}
          className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 pr-1 pl-2.5 text-left focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset disabled:cursor-not-allowed disabled:opacity-50"
        >
          <StatusBadge file={file} />
          <Icon
            icon={`catppuccin:${getIconName(fileName)}`}
            className="size-3 shrink-0"
            aria-hidden
          />
          <span className="flex min-w-0 flex-1 items-baseline gap-1.5 overflow-hidden">
            <span className="shrink-0 font-mono text-[11px] font-medium text-foreground/80">
              {fileName}
            </span>
            {dirPath && (
              <span className="truncate font-mono text-[10px] text-muted-foreground/35">
                {dirPath}
              </span>
            )}
            {counts != null && (counts.added > 0 || counts.removed > 0) && (
              <DiffStat added={counts.added} removed={counts.removed} />
            )}
          </span>
        </button>

        {showActions && (
          <div className="flex max-w-0 shrink-0 items-center gap-0.5 overflow-hidden transition-all duration-150 group-hover/file:max-w-20 group-hover/file:pr-1">
            {!file.isUntracked && onRevert && (
              <IconButtonWithTooltip
                icon={Undo2}
                label="Revert changes"
                onClick={handleRevertClick}
                variant="ghost"
                size="icon-sm"
                disabled={reverting}
              />
            )}
            {onStage && (
              <IconButtonWithTooltip
                icon={toggling ? Minus : file.isStaged ? Minus : Plus}
                label={file.isStaged ? "Unstage file" : "Stage file"}
                onClick={handleToggle}
                size="icon-sm"
                disabled={toggling}
              />
            )}
          </div>
        )}
      </div>

      {isExpanded && mode && (
        <div className="animate-in px-2.5 pb-2.5 pt-0.5 duration-150 fade-in-0">
          {diffLoading ? (
            <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-muted/10 px-3 py-3 text-xs text-muted-foreground">
              <LoadingSpinner size="sm" />
              Loading diff…
            </div>
          ) : diff != null ? (
            <DiffView
              diff={diff}
              filePath={file.filePath}
              mode={mode}
              className="border-border/40"
            />
          ) : null}
        </div>
      )}
    </div>
  )
})

// ─── Simple file row (non-expandable) ────────────────────────────────────────

interface FileRowProps {
  file: ChangedFile
  sessionId: string
  onClick?: (filePath: string) => void
  className?: string
}

export const FileRow = memo(function FileRow({
  file,
  sessionId,
  onClick,
  className,
}: FileRowProps) {
  const { data: diff, isLoading: diffLoading } = useGitFileDiff(
    sessionId,
    file.filePath,
    file.raw,
    true
  )
  const counts = diff != null ? parseDiffCounts(diff) : null

  const handleClick = useCallback(() => {
    onClick?.(file.filePath)
  }, [onClick, file.filePath])

  const pathParts = file.filePath.split("/")
  const fileName = pathParts[pathParts.length - 1] ?? file.filePath
  const dirPath =
    pathParts.length > 1 ? pathParts.slice(0, -1).join("/") + "/" : null

  return (
    <div
      className={cn(
        "group/row flex w-full cursor-pointer items-center gap-2.5 border-t border-border/15 px-4 py-2 text-left first:border-t-0 transition-colors hover:bg-muted/30",
        className
      )}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          handleClick()
        }
      }}
    >
      <StatusBadge file={file} />
      <Icon
        icon={`catppuccin:${getIconName(fileName)}`}
        className="size-3.5 shrink-0 opacity-80 transition-opacity group-hover/row:opacity-100"
        aria-hidden
      />
      <span className="flex min-w-0 flex-1 items-baseline gap-1.5 overflow-hidden">
        <span className="shrink-0 font-mono text-[11.5px] font-medium text-foreground/80 transition-colors group-hover/row:text-foreground">
          {fileName}
        </span>
        {dirPath && (
          <span className="truncate font-mono text-[10px] text-muted-foreground/35">
            {dirPath}
          </span>
        )}
      </span>

      {diffLoading ? (
        <LoadingSpinner size="sm" className="shrink-0" />
      ) : counts && (counts.added > 0 || counts.removed > 0) ? (
        <DiffStat added={counts.added} removed={counts.removed} />
      ) : null}
    </div>
  )
})