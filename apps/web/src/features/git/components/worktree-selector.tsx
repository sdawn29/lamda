import * as React from "react"
import {
  ChevronDownIcon,
  MonitorIcon,
  GitBranchIcon,
  FolderGit2Icon,
  GitMergeIcon,
  CheckIcon,
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
  DialogTitle,
} from "@/shared/ui/dialog"
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
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select"
import {
  useCreateThreadWorktree,
  useSwitchThreadToLocal,
  useMergeThreadWorktree,
} from "@/features/workspace/mutations"

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

/** Derives a branch name `lamda/<slug>` from the chat title (lowercased, dashed). */
function branchNameFromTitle(title: string | undefined): string {
  const slug = (title ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 40)
    .replace(/-+$/, "")
  return `lamda/${slug || "worktree"}`
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

  const createWorktree = useCreateThreadWorktree()
  const switchToLocal = useSwitchThreadToLocal()
  const mergeWorktree = useMergeThreadWorktree()

  const inWorktree = !!worktreeBranch
  const reportError = onError ?? ((m: string) => toast.error(m))

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
      { threadId, sessionId, body: { newBranch: branch, baseRef: baseRef || undefined } },
      {
        onSuccess: () => {
          setDialogOpen(false)
          setNewBranch("")
        },
        onError: (error) => reportError(parseError(error)),
      }
    )
  }

  function handleSwitchLocal() {
    setOpen(false)
    if (!inWorktree) return
    switchToLocal.mutate(
      { threadId, sessionId },
      { onError: (error) => reportError(parseError(error)) }
    )
  }

  function runMerge(force: boolean) {
    mergeWorktree.mutate(
      { threadId, sessionId, force },
      {
        onSuccess: (result) => {
          if (result.ok) {
            setMergeConfirmOpen(false)
            toast.success(
              result.branch
                ? `Merged ${result.branch} into the workspace`
                : "Merged into the workspace"
            )
          } else if (result.uncommitted) {
            // Needs confirmation to discard uncommitted changes.
            setMergeConfirmOpen(true)
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
        <PopoverContent className="w-60 p-0" side="top" align="start" sideOffset={6}>
          <Command>
            <CommandList>
              <CommandGroup className="p-1">
                <CommandItem
                  className="items-start gap-2 rounded-md px-2 py-1.5"
                  onSelect={handleSwitchLocal}
                >
                  <MonitorIcon className="mt-0.5 size-3.5 shrink-0" />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-xs font-medium">Local</span>
                    <span className="text-3xs text-muted-foreground">
                      Run this thread in the workspace directory
                    </span>
                  </span>
                  {!inWorktree && (
                    <CheckIcon className="ml-auto mt-0.5 size-3.5 shrink-0" />
                  )}
                </CommandItem>
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
                    <CheckIcon className="ml-auto mt-0.5 size-3.5 shrink-0" />
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
                        {mergeWorktree.isPending ? "Merging…" : "Merge to workspace"}
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
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                New branch
              </span>
              <Input
                placeholder="feat/my-change"
                value={newBranch}
                onChange={(e) => setNewBranch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate()
                }}
                autoFocus
              />
            </label>
            {branches.length > 0 && (
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  Base branch
                </span>
                <Select value={baseRef} onValueChange={(value) => setBaseRef(value ?? "")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select base branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b} value={b}>
                        {b}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            )}
          </div>
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
    </>
  )
}
