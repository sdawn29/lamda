import { memo, useState, useMemo, useCallback, useEffect, useRef } from "react"
import { GitCompare, ChevronRight, Undo2, Loader2, Sparkles, Eye, ExternalLink } from "lucide-react"
import { openFileWithApp } from "@/features/electron/api"
import { useElectronPlatform, useOpenWithApps } from "@/features/electron"
import { Button } from "@/shared/ui/button"
import { useTurns, useRevertToTurn, useGitFileDiff, DiffView, DiffStat, parseDiffCounts } from "@/features/git"
import { useRightSidebar } from "@/features/layout"
import { useMainTabs } from "@/features/main-tabs"
import { useGitRevertFile } from "@/features/git/mutations"
import { type ChangedFile, parseStatusLine } from "@/features/git/components/status-badge"
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
    <div ref={cardRef}>
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
        className="group flex cursor-pointer items-center gap-1.5 px-3 py-1.5 transition-colors hover:bg-muted/20"
      >
        <Icon
          icon={`catppuccin:${getIconName(fileName)}`}
          className="size-3 shrink-0 opacity-60"
          aria-hidden
        />
        <span className="flex min-w-0 flex-1 items-baseline gap-1.5 overflow-hidden">
          <span className="shrink-0 font-mono text-[11px] font-medium text-foreground/70">
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
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
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
            className="flex size-5 items-center justify-center rounded text-muted-foreground/40 transition-colors hover:bg-muted hover:text-muted-foreground"
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
            className="flex size-5 items-center justify-center rounded text-muted-foreground/40 transition-colors hover:bg-muted hover:text-muted-foreground"
          >
            <ExternalLink className="h-3 w-3" />
          </button>
          {!file.isUntracked && onRevert && (
            <button
              type="button"
              onClick={handleRevert}
              disabled={reverting}
              aria-label="Revert file"
              className="flex size-5 items-center justify-center rounded text-muted-foreground/40 transition-colors hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-30"
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
          "h-3 w-3 shrink-0 text-muted-foreground/30 transition-transform duration-150",
          expanded && "rotate-90"
        )} />
      </div>

      {expanded && (
        <div className="border-t border-border/30 px-3 py-2">
          {diffLoading ? (
            <div className="flex items-center gap-2 rounded border border-border/30 bg-muted/10 px-3 py-2.5 text-xs text-muted-foreground/50">
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
}

export const FileChangesCard = memo(function FileChangesCard({
  sessionId,
  rootPath,
  openWithAppId,
}: FileChangesCardProps) {
  const { data: turns = [] } = useTurns(sessionId)
  const latestTurn = turns[0]
  const { open: openRightSidebar } = useRightSidebar()
  const revertToTurn = useRevertToTurn(sessionId)
  const revertFile = useGitRevertFile(sessionId)

  const [expanded, setExpanded] = useState(true)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const files: ChangedFile[] = useMemo(() => {
    if (!latestTurn) return []
    return latestTurn.files
      .map((f) => parseStatusLine(`${f.postStatusCode} ${f.filePath}`))
      .filter(Boolean)
  }, [latestTurn])

  const hasChanges = files.length > 0

  const handleRevertFile = useCallback(
    async (file: ChangedFile) => {
      await revertFile.mutateAsync({ filePath: file.filePath, raw: file.raw })
    },
    [revertFile]
  )

  const handleConfirmRevert = () => {
    revertToTurn.mutate(latestTurn?.id ?? 0)
    setConfirmOpen(false)
  }

  if (!hasChanges) {
    return null
  }

  return (
    <>
      <div className="mx-auto w-full max-w-3xl px-6 py-2">
        <div className="overflow-hidden rounded-lg border border-border/40 bg-black/5 dark:bg-white/[0.03]">
          {/* Header */}
          <div className={cn("flex items-center gap-3 px-3 py-2.5", expanded && "border-b border-border/30")}>
            {/* Left: icon + label + count — clickable to expand */}
            <div
              className="flex flex-1 cursor-pointer items-center gap-2"
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
              <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted">
                <Sparkles className="h-3 w-3 text-muted-foreground/60" />
              </div>
              <span className="text-xs font-medium text-foreground/70">Changes this turn</span>
              <span className="flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-muted px-1.5 font-mono text-[10px] tabular-nums text-muted-foreground/60">
                {files.length}
              </span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                onClick={() => openRightSidebar()}
                className="h-7 gap-1.5 px-2.5 text-[11px] text-muted-foreground hover:text-foreground"
              >
                <GitCompare className="h-3 w-3" />
                Diff
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirmOpen(true)}
                disabled={revertToTurn.isPending}
                className="h-7 gap-1.5 px-2.5 text-[11px] text-muted-foreground disabled:opacity-50"
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
                className="rounded p-1 text-muted-foreground/40 transition-colors hover:text-muted-foreground"
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
            <div className="divide-y divide-border/20">
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
