import { Icon } from "@iconify/react"
import { ArrowLeft, FileWarning } from "lucide-react"
import { Alert, AlertDescription } from "@/shared/ui/alert"
import { Button } from "@/shared/ui/button"
import { getIconName } from "@/shared/ui/file-icon"
import { LoadingSpinner } from "@/shared/ui/loading-spinner"
import { useGitFileDiff } from "../queries"
import { DiffView, type DiffMode } from "./diff-view"
import { StatusBadge, type ChangedFile } from "./status-badge"

interface FocusedFileDiffProps {
  sessionId: string
  file: ChangedFile
  mode: DiffMode
  onClose: () => void
}

export function FocusedFileDiff({
  sessionId,
  file,
  mode,
  onClose,
}: FocusedFileDiffProps) {
  const {
    data: diff,
    isLoading,
    error,
  } = useGitFileDiff(sessionId, file.filePath, file.raw, true)
  const fileName = file.filePath.split("/").pop() ?? file.filePath

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-y border-border/50 bg-muted/15 px-2">
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onClose}
          aria-label="Back to review"
          title="Back to review"
        >
          <ArrowLeft />
        </Button>
        <Icon
          icon={`catppuccin:${getIconName(fileName)}`}
          className="size-3.5 shrink-0"
          aria-hidden
        />
        <span
          className="min-w-0 flex-1 truncate text-xs font-medium"
          title={file.filePath}
        >
          {file.filePath}
        </span>
        <StatusBadge file={file} />
      </div>

      <div className="min-h-0 flex-1 overflow-hidden p-2">
        {isLoading ? (
          <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
            <LoadingSpinner size="sm" />
            Loading diff
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <FileWarning />
            <AlertDescription>
              {error instanceof Error ? error.message : "Failed to load diff"}
            </AlertDescription>
          </Alert>
        ) : diff ? (
          <DiffView
            diff={diff}
            filePath={file.filePath}
            mode={mode}
            maxHeight={null}
            className="h-full border-border/60"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            No diff is available for this file.
          </div>
        )}
      </div>
    </div>
  )
}
