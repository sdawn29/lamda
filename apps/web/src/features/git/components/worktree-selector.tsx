import * as React from "react"
import {
  ChevronDownIcon,
  MonitorIcon,
  GitBranchIcon,
  FolderGit2Icon,
  GitMergeIcon,
  CheckIcon,
  FileWarningIcon,
  Loader2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/shared/ui/button"
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/shared/ui/command"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogDescription,
  DialogTitle,
} from "@/shared/ui/dialog"
import { Alert, AlertDescription } from "@/shared/ui/alert"
import { Badge } from "@/shared/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog"
import { Input } from "@/shared/ui/input"
import { Field, FieldGroup, FieldLabel } from "@/shared/ui/field"
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select"
import {
  useCreateThreadWorktree,
  useMergeThreadWorktree,
  useResolveThreadWorktreeConflict,
  useContinueThreadWorktreeMerge,
  useAbortThreadWorktreeMerge,
} from "@/features/workspace/mutations"
import { branchNameFromTitle } from "../branch-name"

interface WorktreeSelectorProps {
  threadId: string
  sessionId?: string | null
  /** The chat/thread title — the new branch name is derived from it. */
  threadTitle?: string
  /** Branches offered as the worktree base. */
  branches: string[]
  /** The current branch, used as the default base ref. */
  currentBranch: string | null
  /** Branch of the thread's active worktree, or null when running locally. */
  worktreeBranch?: string | null
  onError?: (message: string) => void
}

function parseError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  const stripped = message.replace(/^API \d+:\s*/, "")
  try {
    const parsed = JSON.parse(stripped) as { error?: string }
    return parsed.error ?? stripped
  } catch {
    return stripped
  }
}

/** Surfaces the outcome of a completed worktree merge as a toast. */
function notifyMergeDone(result: {
  branch?: string | null
  cleanupWarning?: string
}): void {
  if (result.cleanupWarning) {
    toast.warning("Merge completed with a cleanup warning", {
      description: result.cleanupWarning,
    })
  } else {
    toast.success(
      result.branch
        ? `Merged ${result.branch} into the workspace`
        : "Merged into the workspace"
    )
  }
}

export function WorktreeSelector({
  threadId,
  sessionId,
  threadTitle,
  branches,
  currentBranch,
  worktreeBranch,
  onError,
}: WorktreeSelectorProps) {
  const [open, setOpen] = React.useState(false)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [newBranch, setNewBranch] = React.useState("")
  const [baseRef, setBaseRef] = React.useState<string>("")
  // Set when a merge reports uncommitted changes, to confirm a forced merge.
  const [mergeConfirmOpen, setMergeConfirmOpen] = React.useState(false)
  const [conflictDialogOpen, setConflictDialogOpen] = React.useState(false)
  const [conflictFiles, setConflictFiles] = React.useState<string[]>([])
  const [remainingConflicts, setRemainingConflicts] = React.useState<string[]>(
    []
  )
  const [resolutions, setResolutions] = React.useState<
    Record<string, "ours" | "theirs">
  >({})
  const [mergeReadyToContinue, setMergeReadyToContinue] = React.useState(false)

  const createWorktree = useCreateThreadWorktree()
  const mergeWorktree = useMergeThreadWorktree()
  const resolveConflict = useResolveThreadWorktreeConflict()
  const continueMerge = useContinueThreadWorktreeMerge()
  const abortMerge = useAbortThreadWorktreeMerge()

  const inWorktree = !!worktreeBranch
  const reportError = onError ?? ((m: string) => toast.error(m))

  function resetConflictState() {
    setConflictDialogOpen(false)
    setConflictFiles([])
    setRemainingConflicts([])
    setResolutions({})
    setMergeReadyToContinue(false)
  }

  function openDialog() {
    setOpen(false)
    setBaseRef(currentBranch ?? branches[0] ?? "")
    // Default the branch to lamda/<slugified chat title>; the user can edit it.
    setNewBranch(branchNameFromTitle(threadTitle))
    setDialogOpen(true)
  }

  function handleCreate() {
    const branch = newBranch.trim()
    if (!branch) return
    createWorktree.mutate(
      {
        threadId,
        sessionId,
        body: { newBranch: branch, baseRef: baseRef || undefined },
      },
      {
        onSuccess: () => {
          setDialogOpen(false)
          setNewBranch("")
        },
        onError: (error) => reportError(parseError(error)),
      }
    )
  }

  function runMerge(force: boolean) {
    mergeWorktree.mutate(
      { threadId, sessionId, force },
      {
        onSuccess: (result) => {
          if (result.ok) {
            setMergeConfirmOpen(false)
            notifyMergeDone(result)
          } else if (result.uncommitted) {
            // Needs confirmation to discard uncommitted changes.
            setMergeConfirmOpen(true)
          } else if ("conflicts" in result) {
            setConflictFiles(result.conflicts)
            setRemainingConflicts(result.conflicts)
            setResolutions({})
            setMergeReadyToContinue(result.readyToContinue)
            setConflictDialogOpen(true)
          } else {
            reportError(result.error)
          }
        },
        onError: (error) => reportError(parseError(error)),
      }
    )
  }

  function handleMerge() {
    setOpen(false)
    runMerge(false)
  }

  function handleResolveConflict(
    filePath: string,
    strategy: "ours" | "theirs"
  ) {
    resolveConflict.mutate(
      { threadId, filePath, strategy },
      {
        onSuccess: ({ conflicts }) => {
          setRemainingConflicts(conflicts)
          setMergeReadyToContinue(conflicts.length === 0)
          setResolutions((current) => ({ ...current, [filePath]: strategy }))
        },
        onError: (error) => reportError(parseError(error)),
      }
    )
  }

  function handleContinueMerge() {
    continueMerge.mutate(
      { threadId, sessionId },
      {
        onSuccess: (result) => {
          resetConflictState()
          notifyMergeDone(result)
        },
        onError: (error) => reportError(parseError(error)),
      }
    )
  }

  function handleAbortMerge() {
    abortMerge.mutate(threadId, {
      onSuccess: () => {
        resetConflictState()
      },
      onError: (error) => reportError(parseError(error)),
    })
  }

  // Show just "Worktree" / "Local" here; the branch name is the branch selector's job.
  const label = inWorktree ? "Worktree" : "Local"

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={open}
              title="Working location"
            >
              {inWorktree ? (
                <FolderGit2Icon data-icon="inline-start" />
              ) : (
                <MonitorIcon data-icon="inline-start" />
              )}
              <span className="max-w-[10rem] truncate">{label}</span>
              <ChevronDownIcon
                data-icon="inline-end"
                className={`opacity-50 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
              />
            </Button>
          }
        />
        <PopoverContent
          className="w-60 p-0"
          side="top"
          align="start"
          sideOffset={6}
        >
          <Command>
            <CommandList>
              <CommandGroup className="p-1">
                {!inWorktree && (
                  <CommandItem
                    disabled
                    className="items-start gap-2 rounded-md px-2 py-1.5"
                  >
                    <MonitorIcon className="mt-0.5 size-3.5 shrink-0" />
                    <span className="flex min-w-0 flex-col">
                      <span className="text-xs font-medium">Local</span>
                      <span className="text-3xs text-muted-foreground">
                        Run this thread in the workspace directory
                      </span>
                    </span>
                    <CheckIcon className="mt-0.5 ml-auto size-3.5 shrink-0" />
                  </CommandItem>
                )}
                <CommandItem
                  disabled={inWorktree || createWorktree.isPending}
                  className="items-start gap-2 rounded-md px-2 py-1.5"
                  onSelect={openDialog}
                >
                  <GitBranchIcon className="mt-0.5 size-3.5 shrink-0" />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-xs font-medium">
                      {inWorktree ? "Worktree" : "New worktree"}
                    </span>
                    <span className="text-3xs text-muted-foreground">
                      {inWorktree
                        ? "This thread is running in a worktree"
                        : "Isolate this thread on a new branch"}
                    </span>
                  </span>
                  {inWorktree && (
                    <CheckIcon className="mt-0.5 ml-auto size-3.5 shrink-0" />
                  )}
                </CommandItem>
                {inWorktree && (
                  <CommandItem
                    disabled={mergeWorktree.isPending}
                    className="items-start gap-2 rounded-md px-2 py-1.5"
                    onSelect={handleMerge}
                  >
                    <GitMergeIcon className="mt-0.5 size-3.5 shrink-0" />
                    <span className="flex min-w-0 flex-col">
                      <span className="text-xs font-medium">
                        {mergeWorktree.isPending
                          ? "Merging…"
                          : "Merge to workspace"}
                      </span>
                      <span className="text-3xs text-muted-foreground">
                        Merge {worktreeBranch}, remove the worktree, go local
                      </span>
                    </span>
                  </CommandItem>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New worktree</DialogTitle>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="worktree-new-branch">New branch</FieldLabel>
              <Input
                id="worktree-new-branch"
                placeholder="feat/my-change"
                value={newBranch}
                onChange={(e) => setNewBranch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate()
                }}
                autoFocus
              />
            </Field>
            {branches.length > 0 && (
              <Field>
                <FieldLabel>Base branch</FieldLabel>
                <Select
                  value={baseRef}
                  onValueChange={(value) => setBaseRef(value ?? "")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select base branch" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {branches.map((b) => (
                        <SelectItem key={b} value={b}>
                          {b}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            )}
          </FieldGroup>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDialogOpen(false)
                setNewBranch("")
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!newBranch.trim() || createWorktree.isPending}
            >
              {createWorktree.isPending ? "Creating…" : "Create worktree"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={mergeConfirmOpen} onOpenChange={setMergeConfirmOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Merge with uncommitted changes?</AlertDialogTitle>
            <AlertDialogDescription>
              The worktree has uncommitted changes that won't be merged and will
              be lost when it's removed. Merge "{worktreeBranch}" anyway?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mergeWorktree.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => runMerge(true)}
              disabled={mergeWorktree.isPending}
            >
              {mergeWorktree.isPending ? "Merging…" : "Merge anyway"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={conflictDialogOpen}>
        <DialogContent className="sm:max-w-2xl" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Resolve merge conflicts</DialogTitle>
            <DialogDescription>
              Choose which version to keep for each conflicted file before
              completing the merge.
            </DialogDescription>
          </DialogHeader>

          <Alert>
            <FileWarningIcon />
            <AlertDescription>
              “Local” is the workspace branch. “Worktree” is{" "}
              {worktreeBranch ?? "the incoming branch"}.
            </AlertDescription>
          </Alert>

          <div className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
            {conflictFiles.length === 0 && (
              <Alert variant={mergeReadyToContinue ? "default" : "destructive"}>
                <AlertDescription>
                  {mergeReadyToContinue
                    ? "All conflicts are resolved. Complete the merge to finish cleanup."
                    : "Git reports an unresolved merge, but no files were returned. Cancel the merge, then retry after checking the workspace Git status."}
                </AlertDescription>
              </Alert>
            )}
            {conflictFiles.map((filePath) => {
              const resolution = resolutions[filePath]
              const isRemaining = remainingConflicts.includes(filePath)
              return (
                <div
                  key={filePath}
                  className="flex flex-col gap-2 rounded-lg border p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate font-mono text-xs">
                      {filePath}
                    </span>
                    {resolution && !isRemaining && (
                      <Badge variant="secondary">
                        {resolution === "ours"
                          ? "Keeping local"
                          : "Keeping worktree"}
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!isRemaining || resolveConflict.isPending}
                      onClick={() => handleResolveConflict(filePath, "ours")}
                    >
                      Keep local
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!isRemaining || resolveConflict.isPending}
                      onClick={() => handleResolveConflict(filePath, "theirs")}
                    >
                      Keep worktree
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              disabled={abortMerge.isPending || continueMerge.isPending}
              onClick={handleAbortMerge}
            >
              {abortMerge.isPending && <Loader2Icon className="animate-spin" />}
              Cancel merge
            </Button>
            <Button
              disabled={
                !mergeReadyToContinue ||
                remainingConflicts.length > 0 ||
                continueMerge.isPending ||
                abortMerge.isPending
              }
              onClick={handleContinueMerge}
            >
              {continueMerge.isPending && (
                <Loader2Icon className="animate-spin" />
              )}
              Complete merge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
