import { useCallback, useState, memo } from "react"
import {
  Check,
  ChevronDown,
  GitCommit,
  GitCompare,
  History,
  Maximize2,
  Minimize2,
  X,
} from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu"
import { Github } from "@lobehub/icons"
import { useReviewPanel } from "../store"
import { GithubReviewView, useGithubConnected } from "@/features/github"
import {
  GitlabLogo,
  GitlabReviewView,
  useGitlabConnected,
} from "@/features/gitlab"
import { useMainTabsStore } from "@/features/main-tabs"
import {
  useGitDiffStat,
  useTurns,
  useTurnDiffStat,
  useLastCommitAt,
  useBranch,
} from "../queries"
import { type DiffMode } from "./diff-view"
import { type SortMode } from "./sort-utils"
import {
  useShortcutHandler,
  useShortcutBinding,
} from "@/shared/components/keyboard-shortcuts-provider"
import { SHORTCUT_ACTIONS } from "@/shared/lib/keyboard-shortcuts"
import { ShortcutKbd } from "@/shared/ui/kbd"
import { type ContentView } from "./review-panel-types"
import { SourceControlToolbarSection } from "./source-control-toolbar-section"
import { SourceControlContent } from "./source-control-content"
import { FileContent } from "./review-file-content"

interface ReviewPanelProps {
  sessionId: string
  workspaceSessionId?: string
  openWithAppId?: string | null
  isEmbedded?: boolean
  onClose?: () => void
}

export const ReviewPanel = memo(function ReviewPanel({
  sessionId,
  workspaceSessionId: workspaceSessionIdProp,
  openWithAppId,
  isEmbedded = false,
  onClose,
}: ReviewPanelProps) {
  const workspaceSessionId = workspaceSessionIdProp ?? sessionId

  const {
    close: closeDiffPanel,
    toggleFullscreen,
    isFullscreen,
    currentWorkspacePath,
  } = useReviewPanel()

  const activeFileTab = useMainTabsStore((s) => {
    if (!s.activeTabId) return null
    const tab = s.tabs.find((t) => t.id === s.activeTabId)
    return tab?.type === "file" ? tab : null
  })
  const clearActiveTab = useMainTabsStore((s) => s.clearActiveTab)

  const close = onClose ?? closeDiffPanel

  const { data: diffStat } = useGitDiffStat(workspaceSessionId)
  const { data: turnsData = [] } = useTurns(sessionId)

  // GitHub view is offered only when gh is connected for this repo.
  const githubConnected = useGithubConnected({ id: sessionId })
  const gitlabConnected = useGitlabConnected({ id: sessionId })
  const { data: currentBranch } = useBranch(sessionId)

  // Source-control tab state (lifted so toolbar and content share it)
  const [scView, setScView] = useState<ContentView>("turn")
  const [scMode, setScMode] = useState<DiffMode>("inline")
  const [scSortMode, setScSortMode] = useState<SortMode>("name")
  const [turnsClearedAt, setTurnsClearedAt] = useState(0)

  // Mirror TurnHistoryView's cutoff so the header diff stat resets after a
  // commit (manual or agent-driven) — otherwise it keeps showing the last
  // turn's +/- numbers even though the turn list below has been cleared.
  const lastCommitAt = useLastCommitAt(sessionId)
  const turnsCutoff = Math.max(turnsClearedAt, lastCommitAt)
  const activeTurnId = turnsData.find(
    (t) => t.inProgress || !turnsCutoff || t.startedAt > turnsCutoff
  )?.id
  const { data: turnDiffStat } = useTurnDiffStat(
    sessionId,
    activeTurnId,
    scView === "turn" && activeTurnId !== undefined
  )
  const visibleDiffStat =
    scView === "all" ? diffStat : scView === "turn" ? turnDiffStat : undefined

  useShortcutHandler(SHORTCUT_ACTIONS.TOGGLE_FULLSCREEN_DIFF, toggleFullscreen)
  const fullscreenBinding = useShortcutBinding(
    SHORTCUT_ACTIONS.TOGGLE_FULLSCREEN_DIFF
  )

  const selectScView = useCallback(
    (view: ContentView) => {
      clearActiveTab()
      setScView(view)
    },
    [clearActiveTab]
  )

  const handleCommitSuccess = useCallback(
    () => setTurnsClearedAt(Date.now()),
    []
  )

  return (
    <>
      <div className="flex h-full w-full flex-col bg-transparent">
        {/* Tab bar — only shown when viewing source control */}
        {!activeFileTab && (
          <div className="flex h-11 shrink-0 items-center gap-0.5 bg-transparent px-1">
            {/* View selector for source-control content */}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0 gap-1.5 px-2 text-xs font-medium text-muted-foreground/80 hover:text-foreground"
                  >
                    {scView === "turn" ? (
                      <History className="h-3 w-3" />
                    ) : scView === "history" ? (
                      <GitCommit className="h-3 w-3" />
                    ) : scView === "github" ? (
                      <Github size={12} />
                    ) : scView === "gitlab" ? (
                      <GitlabLogo className="h-3 w-3" />
                    ) : (
                      <GitCompare className="h-3 w-3" />
                    )}
                    {scView === "turn"
                      ? "Turns"
                      : scView === "history"
                        ? "History"
                        : scView === "github"
                          ? "GitHub"
                          : scView === "gitlab"
                            ? "GitLab"
                            : "All Changes"}
                    <ChevronDown className="h-3 w-3 opacity-60" />
                  </Button>
                }
              />
              <DropdownMenuContent align="start" className="w-40">
                <DropdownMenuItem
                  onClick={() => selectScView("turn")}
                  className="flex items-center gap-2"
                >
                  <History className="h-3.5 w-3.5" />
                  Turns
                  {scView === "turn" && (
                    <Check className="ml-auto h-3 w-3 text-muted-foreground" />
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => selectScView("all")}
                  className="flex items-center gap-2"
                >
                  <GitCompare className="h-3.5 w-3.5" />
                  All Changes
                  {scView === "all" && (
                    <Check className="ml-auto h-3 w-3 text-muted-foreground" />
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => selectScView("history")}
                  className="flex items-center gap-2"
                >
                  <GitCommit className="h-3.5 w-3.5" />
                  History
                  {scView === "history" && (
                    <Check className="ml-auto h-3 w-3 text-muted-foreground" />
                  )}
                </DropdownMenuItem>
                {githubConnected && (
                  <DropdownMenuItem
                    onClick={() => selectScView("github")}
                    className="flex items-center gap-2"
                  >
                    <Github size={14} />
                    GitHub
                    {scView === "github" && (
                      <Check className="ml-auto h-3 w-3 text-muted-foreground" />
                    )}
                  </DropdownMenuItem>
                )}
                {gitlabConnected && (
                  <DropdownMenuItem
                    onClick={() => selectScView("gitlab")}
                    className="flex items-center gap-2"
                  >
                    <GitlabLogo className="h-3.5 w-3.5" />
                    GitLab
                    {scView === "gitlab" && (
                      <Check className="ml-auto h-3 w-3 text-muted-foreground" />
                    )}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {visibleDiffStat &&
              (visibleDiffStat.additions > 0 ||
                visibleDiffStat.deletions > 0) && (
                <span className="flex animate-in items-center gap-1 font-mono text-2xs leading-none duration-200 fade-in-0 zoom-in-90">
                  <span className="text-diff-add">
                    +{visibleDiffStat.additions}
                  </span>
                  <span className="text-diff-remove">
                    -{visibleDiffStat.deletions}
                  </span>
                </span>
              )}

            <div className="flex-1" />

            {/* Git actions + diff mode — not in history or GitHub views */}
            {scView !== "history" &&
              scView !== "github" &&
              scView !== "gitlab" && (
                <SourceControlToolbarSection
                  workspaceSessionId={workspaceSessionId}
                  view={scView}
                  mode={scMode}
                  setMode={setScMode}
                  sortMode={scSortMode}
                  setSortMode={setScSortMode}
                />
              )}

            {/* Right side buttons */}
            <div className="flex shrink-0 items-center gap-0.5 px-0.5">
              {!isEmbedded && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={toggleFullscreen}
                        className="text-muted-foreground/60 hover:text-foreground"
                      >
                        {isFullscreen ? <Minimize2 /> : <Maximize2 />}
                        <span className="sr-only">
                          {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                        </span>
                      </Button>
                    }
                  />
                  <TooltipContent>
                    {isFullscreen ? "Exit fullscreen" : "Fullscreen"}{" "}
                    <ShortcutKbd binding={fullscreenBinding} className="ml-1" />
                  </TooltipContent>
                </Tooltip>
              )}
              {!isEmbedded && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={close}
                        className="text-muted-foreground/60 hover:text-foreground"
                      >
                        <X />
                        <span className="sr-only">Close panel</span>
                      </Button>
                    }
                  />
                  <TooltipContent>Close panel</TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-hidden">
          {activeFileTab ? (
            <FileContent
              filePath={activeFileTab.filePath}
              openWithAppId={openWithAppId}
              workspacePath={
                activeFileTab.sourceUrl
                  ? activeFileTab.workspacePath
                  : (currentWorkspacePath ?? activeFileTab.workspacePath)
              }
              initialScrollToLine={activeFileTab.scrollToLine}
              sourceUrl={activeFileTab.sourceUrl}
            />
          ) : scView === "github" ? (
            <GithubReviewView
              sessionId={sessionId}
              branch={currentBranch?.branch ?? null}
            />
          ) : scView === "gitlab" ? (
            <GitlabReviewView
              sessionId={sessionId}
              branch={currentBranch?.branch ?? null}
            />
          ) : (
            <SourceControlContent
              sessionId={sessionId}
              workspaceSessionId={workspaceSessionId}
              view={scView}
              mode={scMode}
              sortMode={scSortMode}
              onCommitSuccess={handleCommitSuccess}
              turnsClearedAt={turnsClearedAt}
            />
          )}
        </div>
      </div>
    </>
  )
})
