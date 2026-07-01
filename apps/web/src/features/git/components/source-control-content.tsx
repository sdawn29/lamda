import { useCallback, useMemo, memo } from "react"
import { FolderGit2, GitCompare, Loader2 } from "lucide-react"
import { Alert, AlertDescription } from "@/shared/ui/alert"
import { Button } from "@/shared/ui/button"
import { useGitStatus, useTurns } from "../queries"
import {
  useGitStage,
  useGitRevertFile,
  useInitializeGitRepository,
} from "../mutations"
import { type ChangedFile, parseStatusLines } from "./status-badge"
import { type DiffMode } from "./diff-view"
import { type SortMode, applySortMode } from "./sort-utils"
import { CommitInputSection } from "./commit-dialog"
import { FilesSection } from "./files-section"
import { HistoryView } from "./history-view"
import { TurnHistoryView } from "./turn-history-view"
import { type ContentView } from "./review-panel-types"

export const SourceControlContent = memo(function SourceControlContent({
  sessionId,
  workspaceSessionId,
  view,
  mode,
  sortMode,
  onCommitSuccess,
  turnsClearedAt,
}: {
  sessionId: string
  workspaceSessionId: string
  view: ContentView
  mode: DiffMode
  sortMode: SortMode
  onCommitSuccess?: () => void
  turnsClearedAt?: number
}) {
  const { data: turnsData = [], isLoading: turnsLoading } = useTurns(sessionId)

  const {
    data: statusData,
    isLoading: loading,
    error: statusError,
  } = useGitStatus(workspaceSessionId)

  const isGitRepo = statusData?.isGitRepo !== false
  const statusRaw = statusData?.raw ?? ""

  const { staged, unstaged } = useMemo(() => {
    const all = parseStatusLines(statusRaw)
    return {
      staged: applySortMode(
        all.filter((f: ChangedFile) => f.isStaged),
        sortMode
      ),
      unstaged: applySortMode(
        all.filter((f: ChangedFile) => !f.isStaged),
        sortMode
      ),
    }
  }, [statusRaw, sortMode])

  const error = statusError instanceof Error ? statusError.message : null

  const initRepo = useInitializeGitRepository(workspaceSessionId)

  const { stage, unstage } = useGitStage(workspaceSessionId)
  const revertFile = useGitRevertFile(workspaceSessionId)

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

  const handleRevert = useCallback(
    async (file: ChangedFile) => {
      await revertFile.mutateAsync({ filePath: file.filePath, raw: file.raw })
    },
    [revertFile]
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 flex-col">
        {view === "turn" ? (
          <TurnHistoryView
            sessionId={sessionId}
            mode={mode}
            turns={turnsData}
            isLoading={turnsLoading}
            clearedAt={turnsClearedAt}
          />
        ) : view === "history" ? (
          <HistoryView sessionId={workspaceSessionId} />
        ) : (
          <>
            <CommitInputSection
              sessionId={workspaceSessionId}
              onCommitSuccess={onCommitSuccess}
            />
            <div className="min-h-0 flex-1 overflow-y-auto">
              {!loading && !isGitRepo && (
                <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                    <FolderGit2 className="h-5 w-5 text-muted-foreground/40" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground/60">
                      Not a git repository
                    </p>
                    <p className="text-3xs leading-relaxed text-muted-foreground/40">
                      This folder is not tracked by git
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1.5 text-xs"
                    onClick={() => initRepo.mutate()}
                    disabled={initRepo.isPending}
                  >
                    {initRepo.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <FolderGit2 className="h-3 w-3" />
                    )}
                    Initialize Repository
                  </Button>
                </div>
              )}

              {isGitRepo && (
                <>
                  {loading && staged.length === 0 && unstaged.length === 0 && (
                    <div className="flex items-center gap-2 px-4 py-4 text-xs text-muted-foreground">
                      <Loader2 className="size-3 animate-spin" />
                      Loading status
                    </div>
                  )}

                  {!loading && error && (
                    <Alert variant="destructive" className="mx-3 mt-3">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  {!loading &&
                    !error &&
                    staged.length === 0 &&
                    unstaged.length === 0 && (
                      <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                          <GitCompare className="h-5 w-5 text-muted-foreground/40" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground/60">
                            No changes
                          </p>
                          <p className="text-3xs text-muted-foreground/40">
                            Your working tree is clean
                          </p>
                        </div>
                      </div>
                    )}

                  {!loading &&
                    !error &&
                    (staged.length > 0 || unstaged.length > 0) && (
                      <FilesSection
                        label="Staged"
                        files={staged}
                        sessionId={workspaceSessionId}
                        mode={mode}
                        onStageToggle={handleStageToggle}
                        onRevert={handleRevert}
                        emptyText="No staged changes"
                      />
                    )}

                  {!loading && !error && unstaged.length > 0 && (
                    <FilesSection
                      label="Changes"
                      files={unstaged}
                      sessionId={workspaceSessionId}
                      mode={mode}
                      onStageToggle={handleStageToggle}
                      onRevert={handleRevert}
                      className="mb-2"
                    />
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
})
