import * as React from "react"
import {
  ChevronDownIcon,
  MonitorIcon,
  GitBranchIcon,
  FolderGit2Icon,
  GitMergeIcon,
  CheckIcon,
  CircleCheckIcon,
  FileWarningIcon,
  Loader2Icon,
  PencilIcon,
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
  useResolveThreadWorktreeConflictContent,
  useContinueThreadWorktreeMerge,
  useAbortThreadWorktreeMerge,
} from "@/features/workspace/mutations"
import { getThreadWorktreeConflictFile } from "@/features/workspace/api"
import { branchNameFromTitle } from "../branch-name"
import { parseApiError } from "../parse-error"
import { ConflictEditor, detectLanguage } from "./diff"

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
  const conflictFiles = React.useRef<string[]>([])
  const [remainingConflicts, setRemainingConflicts] = React.useState<string[]>(
    []
  )
  const [resolutions, setResolutions] = React.useState<
    Record<string, "ours" | "theirs" | "manual">
  >({})
  const [mergeReadyToContinue, setMergeReadyToContinue] = React.useState(false)
  // The file currently open in the manual (Monaco) resolver, its loaded
  // working-tree contents (with conflict markers), and the load state.
  const [editingFile, setEditingFile] = React.useState<string | null>(null)
  const [editorContent, setEditorContent] = React.useState("")
  const [editorLoading, setEditorLoading] = React.useState(false)

  const createWorktree = useCreateThreadWorktree()
  const mergeWorktree = useMergeThreadWorktree()
  const resolveConflict = useResolveThreadWorktreeConflict()
  const resolveConflictContent = useResolveThreadWorktreeConflictContent()
  const continueMerge = useContinueThreadWorktreeMerge()
  const abortMerge = useAbortThreadWorktreeMerge()

  const inWorktree = !!worktreeBranch
  const reportError = onError ?? ((m: string) => toast.error(m))

  function resetConflictState() {
    setConflictDialogOpen(false)
    conflictFiles.current = []
    setRemainingConflicts([])
    setResolutions({})
    setMergeReadyToContinue(false)
    setEditingFile(null)
    setEditorContent("")
    setEditorLoading(false)
  }

  async function openEditor(filePath: string) {
    setEditingFile(filePath)
    setEditorContent("")
    setEditorLoading(true)
    try {
      const { content } = await getThreadWorktreeConflictFile(
        threadId,
        filePath
      )
      setEditorContent(content)
    } catch (error) {
      reportError(parseApiError(error))
      setEditingFile(null)
    } finally {
      setEditorLoading(false)
    }
  }

  function handleSaveResolution() {
    if (!editingFile) return
    const filePath = editingFile
    resolveConflictContent.mutate(
      { threadId, filePath, content: editorContent },
      {
        onSuccess: ({ conflicts }) => {
          setRemainingConflicts(conflicts)
          setMergeReadyToContinue(conflicts.length === 0)
          setResolutions((current) => ({ ...current, [filePath]: "manual" }))
          setEditingFile(null)
          setEditorContent("")
        },
        onError: (error) => reportError(parseApiError(error)),
      }
    )
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
        onError: (error) => reportError(parseApiError(error)),
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
            conflictFiles.current = result.conflicts
            setRemainingConflicts(result.conflicts)
            setResolutions({})
            setMergeReadyToContinue(result.readyToContinue)
            setConflictDialogOpen(true)
          } else {
            reportError(result.error)
          }
        },
        onError: (error) => reportError(parseApiError(error)),
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
        onError: (error) => reportError(parseApiError(error)),
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
        onError: (error) => reportError(parseApiError(error)),
      }
    )
  }

  function handleAbortMerge() {
    abortMerge.mutate(threadId, {
      onSuccess: () => {
        resetConflictState()
      },
      onError: (error) => reportError(parseApiError(error)),
    })
  }

  // Show just "Worktree" / "Local" here; the branch name is the branch selector's job.
  const label = inWorktree ? "Worktree" : "Local"

  const resolvedCount = conflictFiles.current.length - remainingConflicts.length

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
        <DialogContent
          className={editingFile ? "sm:max-w-5xl" : "sm:max-w-2xl"}
          showCloseButton={false}
        >
          {editingFile ? (
            <>
              <DialogHeader>
                <DialogTitle className="truncate font-mono text-sm">
                  {editingFile}
                </DialogTitle>
                <DialogDescription>
                  For each conflict, use <strong>Accept Local</strong>,{" "}
                  <strong>Accept Worktree</strong>, or{" "}
                  <strong>Accept Both</strong> — or edit the file directly —
                  then save.
                </DialogDescription>
              </DialogHeader>

              <div className="h-[60vh] overflow-hidden rounded-md border">
                {editorLoading ? (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    <Loader2Icon className="animate-spin" />
                  </div>
                ) : (
                  <ConflictEditor
                    value={editorContent}
                    language={detectLanguage(editingFile) ?? undefined}
                    onChange={setEditorContent}
                  />
                )}
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  disabled={resolveConflictContent.isPending}
                  onClick={() => {
                    setEditingFile(null)
                    setEditorContent("")
                  }}
                >
                  Back
                </Button>
                <Button
                  disabled={editorLoading || resolveConflictContent.isPending}
                  onClick={handleSaveResolution}
                >
                  {resolveConflictContent.isPending && (
                    <Loader2Icon className="animate-spin" />
                  )}
                  Save resolution
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Resolve merge conflicts</DialogTitle>
                <DialogDescription>
                  Pick a side for each file, or edit it in place to resolve the
                  conflict by hand before completing the merge.
                </DialogDescription>
              </DialogHeader>

              {conflictFiles.current.length > 0 && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium">
                      {resolvedCount} of {conflictFiles.current.length} resolved
                    </span>
                    <span className="truncate text-2xs text-muted-foreground">
                      Local = workspace · Worktree ={" "}
                      {worktreeBranch ?? "incoming"}
                    </span>
                  </div>
                  <div
                    className="h-1.5 overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-valuenow={resolvedCount}
                    aria-valuemax={conflictFiles.current.length}
                  >
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-[width] duration-300 dark:bg-emerald-400"
                      style={{
                        width: `${(resolvedCount / conflictFiles.current.length) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              <div className="-mx-1 flex max-h-[50vh] flex-col gap-1.5 overflow-y-auto px-1">
                {conflictFiles.current.length === 0 && (
                  <Alert
                    variant={mergeReadyToContinue ? "default" : "destructive"}
                  >
                    <AlertDescription>
                      {mergeReadyToContinue
                        ? "All conflicts are resolved. Complete the merge to finish cleanup."
                        : "Git reports an unresolved merge, but no files were returned. Cancel the merge, then retry after checking the workspace Git status."}
                    </AlertDescription>
                  </Alert>
                )}
                {conflictFiles.current.map((filePath) => {
                  const resolution = resolutions[filePath]
                  const isRemaining = remainingConflicts.includes(filePath)
                  const slash = filePath.lastIndexOf("/")
                  const dir = slash === -1 ? "" : filePath.slice(0, slash + 1)
                  const name =
                    slash === -1 ? filePath : filePath.slice(slash + 1)
                  return (
                    <div
                      key={filePath}
                      data-resolved={!isRemaining}
                      className="flex flex-col gap-2.5 rounded-lg border p-3 transition-colors data-[resolved=true]:border-border/60 data-[resolved=true]:bg-muted/40"
                    >
                      <div className="flex items-center gap-2">
                        {isRemaining ? (
                          <FileWarningIcon className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                        ) : (
                          <CircleCheckIcon className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        )}
                        <span
                          className="flex min-w-0 flex-1 items-baseline gap-1.5 font-mono"
                          title={filePath}
                        >
                          <span className="max-w-[60%] shrink-0 truncate text-xs font-medium">
                            {name}
                          </span>
                          {dir && (
                            <span className="min-w-0 truncate text-2xs text-muted-foreground">
                              {dir}
                            </span>
                          )}
                        </span>
                        {resolution && !isRemaining && (
                          <Badge variant="secondary" className="shrink-0">
                            {resolution === "ours"
                              ? "Keeping local"
                              : resolution === "theirs"
                                ? "Keeping worktree"
                                : "Edited"}
                          </Badge>
                        )}
                      </div>
                      {isRemaining && (
                        <div className="flex gap-2 pl-6">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={resolveConflict.isPending}
                            onClick={() =>
                              handleResolveConflict(filePath, "ours")
                            }
                          >
                            Keep local
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={resolveConflict.isPending}
                            onClick={() =>
                              handleResolveConflict(filePath, "theirs")
                            }
                          >
                            Keep worktree
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEditor(filePath)}
                          >
                            <PencilIcon />
                            Edit
                          </Button>
                        </div>
                      )}
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
                  {abortMerge.isPending && (
                    <Loader2Icon className="animate-spin" />
                  )}
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
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
