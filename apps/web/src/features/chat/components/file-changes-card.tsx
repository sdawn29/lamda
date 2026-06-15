import { memo, useState, useMemo, useCallback, useEffect, useRef } from "react"
import { GitCompare, ChevronRight, Undo2, Loader2, Eye, ExternalLink, Files } from "lucide-react"
import { openFileWithApp } from "@/features/electron/api"
import { useElectronPlatform, useOpenWithApps } from "@/features/electron"
import { Button } from "@/shared/ui/button"
import { useRevertToTurn, useGitFileDiff, DiffView, DiffStat, parseDiffCounts } from "@/features/git"
import { useRightSidebar } from "@/features/layout"
import { useMainTabs } from "@/features/main-tabs"
import { useGitRevertFile } from "@/features/git/mutations"
import { StatusBadge, type ChangedFile, parseStatusLine } from "@/features/git/components/status-badge"
import { Icon } from "@iconify/react"
import { getIconName } from "@/shared/ui/file-icon"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/shared/ui/alert-dialog"
import { cn } from "@/shared/lib/utils"
import type { TurnSummary } from "@/features/git/api"


const ChangedFileItem = memo(function ChangedFileItem({
  file,
  sessionId,
  rootPath,
  openWithAppId,
  onRevert,
}: {
  file: ChangedFile
  sessionId: string
  rootPath?: string
  openWithAppId?: string | null
  onRevert?: (file: ChangedFile) => Promise<void>
}) {
  const [expanded, setExpanded] = useState(false)
  const [reverting, setReverting] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const { addFileTab } = useMainTabs()
  const { data: platform } = useElectronPlatform()
  const isMac = platform === "darwin"
  const { data: apps = [] } = useOpenWithApps(isMac)
  const effectiveAppId = useMemo(() => {
    if (!isMac || apps.length === 0) return undefined
    return openWithAppId ?? apps[0].id
  }, [isMac, apps, openWithAppId])

  useEffect(() => {
    if (expanded) {
      cardRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
    }
  }, [expanded])

  const { data: diff, isLoading: diffLoading } = useGitFileDiff(
    sessionId,
    file.filePath,
    file.raw,
    true
  )
  const counts = diff != null ? parseDiffCounts(diff) : null

  const pathParts = file.filePath.split("/")
  const fileName = pathParts[pathParts.length - 1] ?? file.filePath
  const dirPath = pathParts.length > 1 ? pathParts.slice(0, -1).join("/") + "/" : null

  const handleRevert = useCallback(
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

  return (
    <div ref={cardRef} className="group/file">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            setExpanded((v) => !v)
          }
        }}
        className={cn(
          "flex cursor-pointer items-center gap-2 px-3 py-2 transition-colors hover:bg-muted/25",
          expanded && "bg-muted/15"
        )}
      >
        <StatusBadge file={file} />
        <span className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          <Icon
            icon={`catppuccin:${getIconName(fileName)}`}
            className="size-3.5 shrink-0 opacity-75"
            aria-hidden
          />
          <span className="min-w-0 flex-1 overflow-hidden">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate font-mono text-2xs font-medium leading-4 text-foreground/80">
                {fileName}
              </span>
              {counts != null && (counts.added > 0 || counts.removed > 0) && (
                <DiffStat added={counts.added} removed={counts.removed} />
              )}
            </span>
            {dirPath && (
              <span className="block truncate font-mono text-3xs leading-3 text-muted-foreground/45">
                {dirPath}
              </span>
            )}
          </span>
        </span>
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/file:opacity-100">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              const absPath = rootPath
                ? `${rootPath.replace(/\/$/, "")}/${file.filePath}`
                : file.filePath
              addFileTab({ filePath: absPath, title: fileName, workspacePath: rootPath })
            }}
            aria-label="Open in file tab"
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground/45 transition-colors hover:bg-background hover:text-foreground"
          >
            <Eye className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              const absPath = rootPath
                ? `${rootPath.replace(/\/$/, "")}/${file.filePath}`
                : file.filePath
              void openFileWithApp(absPath, effectiveAppId)
            }}
            aria-label="Open in editor"
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground/45 transition-colors hover:bg-background hover:text-foreground"
          >
            <ExternalLink className="h-3 w-3" />
          </button>
          {!file.isUntracked && onRevert && (
            <button
              type="button"
              onClick={handleRevert}
              disabled={reverting}
              aria-label="Revert file"
              className="flex size-6 items-center justify-center rounded-md text-muted-foreground/45 transition-colors hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-30"
            >
              {reverting ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Undo2 className="h-3 w-3" />
              )}
            </button>
          )}
        </div>
        <ChevronRight className={cn(
          "h-3.5 w-3.5 shrink-0 text-muted-foreground/35 transition-transform duration-150",
          expanded && "rotate-90"
        )} />
      </div>

      {expanded && (
        <div className="border-t border-border/30 bg-background/45 px-3 py-2">
          {diffLoading ? (
            <div className="flex items-center gap-2 rounded-md border border-border/40 bg-muted/10 px-3 py-2.5 text-xs text-muted-foreground/55">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading diff…
            </div>
          ) : diff != null ? (
            <DiffView diff={diff} filePath={file.filePath} mode="inline" maxHeight="16rem" className="border-border/30" />
          ) : null}
        </div>
      )}
    </div>
  )
})

interface FileChangesCardProps {
  sessionId: string
  rootPath?: string
  openWithAppId?: string | null
  turn: TurnSummary
}

export const FileChangesCard = memo(function FileChangesCard({
  sessionId,
  rootPath,
  openWithAppId,
  turn,
}: FileChangesCardProps) {
  const { open: openRightSidebar } = useRightSidebar()
  const revertToTurn = useRevertToTurn(sessionId)
  const revertFile = useGitRevertFile(sessionId)

  const [expanded, setExpanded] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const files: ChangedFile[] = useMemo(() => {
    return turn.files
      .map((f) => parseStatusLine(`${f.postStatusCode} ${f.filePath}`))
      .filter(Boolean)
  }, [turn])

  const hasChanges = files.length > 0
  const fileSummary = useMemo(() => {
    let newFiles = 0
    let stagedFiles = 0
    for (const file of files) {
      if (file.isUntracked) newFiles++
      else if (file.isStaged) stagedFiles++
    }
    return { newFiles, stagedFiles }
  }, [files])

  const handleRevertFile = useCallback(
    async (file: ChangedFile) => {
      await revertFile.mutateAsync({ filePath: file.filePath, raw: file.raw })
    },
    [revertFile]
  )

  const handleConfirmRevert = () => {
    revertToTurn.mutate(turn.id)
    setConfirmOpen(false)
  }

  if (!hasChanges) {
    return null
  }

  return (
    <>
      <div className="mx-auto mb-3 w-full max-w-3xl px-3 py-2">
        <div className="overflow-hidden rounded-lg border border-border/60 bg-card/75 shadow-sm shadow-black/[0.03] dark:bg-card/60 dark:shadow-black/20">
          {/* Header */}
          <div className={cn("flex items-center gap-3 px-3 py-3", expanded && "border-b border-border/40")}>
            {/* Left: icon + label + count — clickable to expand */}
            <div
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5"
              onClick={() => setExpanded(!expanded)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  setExpanded(!expanded)
                }
              }}
            >
              <div className="flex size-7 shrink-0 items-center justify-center rounded-md border border-primary/15 bg-primary/10 text-primary">
                <Files className="h-3.5 w-3.5" />
              </div>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium leading-4 text-foreground/85">
                  Files changed
                </span>
                <span className="flex min-w-0 items-center gap-1.5 text-3xs leading-3 text-muted-foreground/60">
                  <span>{files.length} this turn</span>
                  {fileSummary.newFiles > 0 && (
                    <>
                      <span className="text-muted-foreground/30">·</span>
                      <span>{fileSummary.newFiles} new</span>
                    </>
                  )}
                  {fileSummary.stagedFiles > 0 && (
                    <>
                      <span className="text-muted-foreground/30">·</span>
                      <span>{fileSummary.stagedFiles} staged</span>
                    </>
                  )}
                </span>
              </span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                onClick={() => openRightSidebar()}
                className="h-7 gap-1.5 rounded-md px-2.5 text-2xs text-muted-foreground hover:text-foreground"
              >
                <GitCompare className="h-3 w-3" />
                Review
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirmOpen(true)}
                disabled={revertToTurn.isPending}
                className="h-7 gap-1.5 rounded-md px-2.5 text-2xs text-muted-foreground disabled:opacity-50"
              >
                {revertToTurn.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Undo2 className="h-3 w-3" />
                )}
                Revert
              </Button>
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground/45 transition-colors hover:bg-muted hover:text-foreground"
                aria-label={expanded ? "Collapse" : "Expand"}
              >
                <ChevronRight className={cn(
                  "h-3.5 w-3.5 transition-transform duration-200",
                  expanded && "rotate-90"
                )} />
              </button>
            </div>
          </div>

          {/* File list */}
          {expanded && (
            <div className="divide-y divide-border/25 bg-muted/[0.03]">
              {files.map((file, index) => (
                <ChangedFileItem
                  key={`${file.filePath}-${index}`}
                  file={file}
                  sessionId={sessionId}
                  rootPath={rootPath}
                  openWithAppId={openWithAppId}
                  onRevert={handleRevertFile}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Revert turn confirmation */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10">
              <Undo2 className="text-destructive" />
            </AlertDialogMedia>
            <AlertDialogTitle>Revert this turn?</AlertDialogTitle>
            <AlertDialogDescription>
              All {files.length} file{files.length !== 1 ? "s" : ""} changed in
              this turn will be reverted to their previous state. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleConfirmRevert}
            >
              Revert turn
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
})
