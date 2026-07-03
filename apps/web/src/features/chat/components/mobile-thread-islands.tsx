import { useRef, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import {
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Copy,
  Archive,
  Trash2,
} from "lucide-react"

import { Button } from "@/shared/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu"
import { useWorkspace, type Workspace, type Thread } from "@/features/workspace"
import { BranchSelector, WorktreeSelector } from "@/features/git"

interface MobileThreadIslandsProps {
  activeWorkspace: Workspace | undefined
  activeThread: Thread
  sessionId: string
  threadId: string
  branch: string | null
  branches: string[]
  onBranchSelect: (branch: string) => void
  onGitError: (message: string) => void
}

/**
 * Mobile-only floating islands: thread name, branch, working location. The
 * title bar hides these on narrow screens (no room), so they float over the
 * chat view instead — this mirrors the title bar's thread-name island.
 */
export function MobileThreadIslands({
  activeWorkspace,
  activeThread,
  sessionId,
  threadId,
  branch,
  branches,
  onBranchSelect,
  onGitError,
}: MobileThreadIslandsProps) {
  const navigate = useNavigate()
  const {
    setThreadTitle,
    pinThread,
    unpinThread,
    archiveThread,
    deleteThread,
  } = useWorkspace()

  const [isRenamingThread, setIsRenamingThread] = useState(false)
  const [threadRenameValue, setThreadRenameValue] = useState("")
  const threadRenameInputRef = useRef<HTMLInputElement>(null)

  const startThreadRename = () => {
    setThreadRenameValue(activeThread.title ?? "")
    setIsRenamingThread(true)
    setTimeout(() => threadRenameInputRef.current?.select(), 0)
  }

  const commitThreadRename = () => {
    if (activeWorkspace && threadRenameValue.trim()) {
      setThreadTitle(
        activeWorkspace.id,
        activeThread.id,
        threadRenameValue.trim()
      )
    }
    setIsRenamingThread(false)
  }

  const handleTogglePinThread = async () => {
    if (!activeWorkspace) return
    if (activeThread.isPinned) {
      await unpinThread(activeWorkspace.id, activeThread.id)
    } else {
      await pinThread(activeWorkspace.id, activeThread.id)
    }
  }

  const handleArchiveThisThread = async () => {
    if (!activeWorkspace) return
    await archiveThread(activeWorkspace.id, activeThread.id)
    navigate({ to: "/" })
  }

  const handleDeleteThisThread = async () => {
    if (!activeWorkspace) return
    await deleteThread(activeWorkspace.id, activeThread.id)
    navigate({ to: "/" })
  }

  const handleCopyThisThreadId = () => {
    void navigator.clipboard.writeText(activeThread.id)
  }

  return (
    <div className="absolute inset-x-0 top-2 z-30 flex flex-wrap justify-start gap-1.5 px-2">
      <div className="flex max-w-full min-w-0 shrink items-center gap-1 overflow-hidden rounded-lg border border-border bg-background/70 px-2 py-1 shadow-sm backdrop-blur-md">
        {activeWorkspace && (
          <>
            <span className="hidden shrink truncate text-2xs font-medium text-muted-foreground/70 sm:inline">
              {activeWorkspace.name}
            </span>
            <span className="mx-0.5 hidden shrink-0 text-2xs text-muted-foreground/40 select-none sm:inline">
              /
            </span>
          </>
        )}
        {isRenamingThread ? (
          <span className="inline-grid min-w-0">
            <span
              aria-hidden
              className="invisible col-start-1 row-start-1 text-sm font-semibold whitespace-pre"
            >
              {threadRenameValue || " "}
            </span>
            <input
              ref={threadRenameInputRef}
              autoFocus
              size={1}
              value={threadRenameValue}
              onChange={(e) => setThreadRenameValue(e.target.value)}
              onBlur={commitThreadRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitThreadRename()
                if (e.key === "Escape") setIsRenamingThread(false)
              }}
              className="col-start-1 row-start-1 w-full min-w-0 bg-transparent text-sm font-semibold outline-none"
            />
          </span>
        ) : (
          <span className="min-w-0 truncate text-sm font-semibold text-foreground">
            {activeThread.title}
          </span>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                className="ml-0.5 shrink-0 text-muted-foreground/50"
              />
            }
          >
            <MoreHorizontal className="size-3.5" />
            <span className="sr-only">Thread options</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={startThreadRename}>
              <Pencil className="mr-2 h-4 w-4" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleTogglePinThread}>
              {activeThread.isPinned ? (
                <>
                  <PinOff className="mr-2 h-4 w-4" />
                  Unpin
                </>
              ) : (
                <>
                  <Pin className="mr-2 h-4 w-4" />
                  Pin
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleCopyThisThreadId}>
              <Copy className="mr-2 h-4 w-4" />
              Copy Thread ID
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleArchiveThisThread}>
              <Archive className="mr-2 h-4 w-4" />
              Archive
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={handleDeleteThisThread}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Thread
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex shrink-0 items-center rounded-lg border border-border bg-background/70 px-0.5 py-1 shadow-sm backdrop-blur-md [&_button]:rounded-md">
        <BranchSelector
          branch={branch}
          branches={branches}
          onBranchSelect={onBranchSelect}
          onGitError={onGitError}
          sessionId={sessionId}
          disabled={!!activeThread.worktreeBranch}
          disabledReason="This thread runs in a worktree — its branch is managed by the worktree selector"
        />
      </div>
      <div className="flex shrink-0 items-center rounded-lg border border-border bg-background/70 px-0.5 py-1 shadow-sm backdrop-blur-md [&_button]:rounded-md">
        <WorktreeSelector
          threadId={threadId}
          sessionId={sessionId}
          threadTitle={activeThread.title}
          branches={branches}
          currentBranch={branch}
          worktreeBranch={activeThread.worktreeBranch}
          onError={onGitError}
        />
      </div>
    </div>
  )
}
