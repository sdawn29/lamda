import * as React from "react"
import { GitBranchIcon, ChevronDownIcon, PlusIcon } from "lucide-react"
import { Button } from "@/shared/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/shared/ui/command"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import { Input } from "@/shared/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover"
import {
  useCreateBranch,
  useCreateWorkspaceBranch,
  useInitializeGitRepository,
} from "../mutations"
import { useAheadBehind } from "../queries"
import { parseApiError } from "../parse-error"

interface BranchSelectorProps {
  branch: string | null
  branches: string[]
  onBranchSelect?: (branch: string) => void
  onGitError?: (message: string) => void
  sessionId?: string
  /**
   * Workspace this selector belongs to, used to create branches before any
   * session exists (e.g. the new-thread page). Ignored when `sessionId` is set.
   */
  workspaceId?: string
  /**
   * Disables branch switching — used when the thread runs in a worktree, where
   * the branch is fixed by the worktree and managed via the worktree selector.
   */
  disabled?: boolean
  /** Tooltip shown on the trigger when `disabled`. */
  disabledReason?: string
}


export function BranchSelector({
  branch,
  branches,
  onBranchSelect,
  onGitError,
  sessionId,
  workspaceId,
  disabled,
  disabledReason,
}: BranchSelectorProps) {
  const [open, setOpen] = React.useState(false)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [newBranch, setNewBranch] = React.useState("")

  const createBranch = useCreateBranch(sessionId ?? "")
  const createWorkspaceBranch = useCreateWorkspaceBranch(workspaceId ?? null)
  const initializeRepository = useInitializeGitRepository(sessionId ?? "")
  const hasRepository = branch !== null || branches.length > 0
  const { data: aheadBehind } = useAheadBehind(sessionId ?? "")
  // Branch creation works against a session when one exists, otherwise against
  // the workspace (the new-thread page, before the first session is created).
  const canCreateBranch = !!sessionId || !!workspaceId
  const createPending = sessionId
    ? createBranch.isPending
    : createWorkspaceBranch.isPending

  function handleCreate() {
    const name = newBranch.trim()
    if (!name) return
    const onSuccess = (data: { branch: string | null }) => {
      onBranchSelect?.(data.branch ?? name)
      setDialogOpen(false)
      setNewBranch("")
    }
    const onError = (error: unknown) => onGitError?.(parseApiError(error))
    if (sessionId) {
      createBranch.mutate(name, { onSuccess, onError })
    } else if (workspaceId) {
      createWorkspaceBranch.mutate(name, { onSuccess, onError })
    }
  }

  function handleInitializeRepository() {
    if (!sessionId) return
    initializeRepository.mutate(undefined, {
      onSuccess: () => {
        setOpen(false)
      },
      onError: (error) => {
        onGitError?.(parseApiError(error))
      },
    })
  }

  return (
    <>
      <Popover open={disabled ? false : open} onOpenChange={setOpen}>
        <PopoverTrigger
          disabled={disabled}
          render={
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={open}
              disabled={disabled}
              title={disabled ? disabledReason : undefined}
            >
              <GitBranchIcon data-icon="inline-start" />
              <span>
                {branch ?? (hasRepository ? "no branch" : "no repository")}
              </span>
              {aheadBehind && (aheadBehind.ahead ?? 0) > 0 && (
                <span className="text-3xs font-medium text-green-600 dark:text-green-400">
                  ↑{aheadBehind.ahead}
                </span>
              )}
              {aheadBehind && (aheadBehind.behind ?? 0) > 0 && (
                <span className="text-3xs font-medium text-amber-500">
                  ↓{aheadBehind.behind}
                </span>
              )}
              <ChevronDownIcon
                data-icon="inline-end"
                className={`opacity-50 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
              />
            </Button>
          }
        />
        <PopoverContent
          className="w-max min-w-48 p-0"
          side="top"
          align="start"
          sideOffset={6}
        >
          <Command>
            <CommandInput placeholder="Search branch" />
            <CommandList>
              <CommandEmpty>No branches found</CommandEmpty>
              <CommandGroup>
                {branches.map((item) => (
                  <CommandItem
                    key={item}
                    value={item}
                    data-checked={item === branch}
                    onSelect={() => {
                      onBranchSelect?.(item)
                      setOpen(false)
                    }}
                  >
                    {item}
                  </CommandItem>
                ))}
              </CommandGroup>
              {canCreateBranch && (
                <>
                  <CommandSeparator />
                  <CommandGroup>
                    {hasRepository ? (
                      <CommandItem
                        onSelect={() => {
                          setOpen(false)
                          setDialogOpen(true)
                        }}
                      >
                        <PlusIcon />
                        Create new branch
                      </CommandItem>
                    ) : sessionId ? (
                      <CommandItem
                        disabled={initializeRepository.isPending}
                        onSelect={handleInitializeRepository}
                      >
                        <PlusIcon />
                        {initializeRepository.isPending
                          ? "Initializing repository"
                          : "Initialize repository"}
                      </CommandItem>
                    ) : null}
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create new branch</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Branch name"
            value={newBranch}
            onChange={(e) => setNewBranch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate()
            }}
            autoFocus
          />
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
              disabled={!newBranch.trim() || createPending}
            >
              {createPending ? "Creating" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
