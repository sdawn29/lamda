import * as React from "react"
import { GitBranchIcon, ChevronsUpDownIcon, PlusIcon } from "lucide-react"
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
import { useCreateBranch, useInitializeGitRepository } from "../mutations"
import { useAheadBehind } from "../queries"

interface BranchSelectorProps {
  branch: string | null
  branches: string[]
  onBranchSelect?: (branch: string) => void
  onGitError?: (message: string) => void
  sessionId?: string
}

function parseGitError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  const stripped = message.replace(/^API \d+:\s*/, "")

  try {
    const parsed = JSON.parse(stripped) as { error?: string }
    return parsed.error ?? stripped
  } catch {
    return stripped
  }
}

export function BranchSelector({
  branch,
  branches,
  onBranchSelect,
  onGitError,
  sessionId,
}: BranchSelectorProps) {
  const [open, setOpen] = React.useState(false)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [newBranch, setNewBranch] = React.useState("")

  const createBranch = useCreateBranch(sessionId ?? "")
  const initializeRepository = useInitializeGitRepository(sessionId ?? "")
  const hasRepository = branch !== null || branches.length > 0
  const { data: aheadBehind } = useAheadBehind(sessionId ?? "")

  function handleCreate() {
    if (!newBranch.trim() || !sessionId) return
    createBranch.mutate(newBranch.trim(), {
      onSuccess: (data) => {
        onBranchSelect?.(data.branch ?? newBranch.trim())
        setDialogOpen(false)
        setNewBranch("")
      },
      onError: (error) => {
        onGitError?.(parseGitError(error))
      },
    })
  }

  function handleInitializeRepository() {
    if (!sessionId) return
    initializeRepository.mutate(undefined, {
      onSuccess: () => {
        setOpen(false)
      },
      onError: (error) => {
        onGitError?.(parseGitError(error))
      },
    })
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button variant="ghost" size="sm" aria-expanded={open}>
              <GitBranchIcon data-icon="inline-start" />
              <span>
                {branch ?? (hasRepository ? "no branch" : "no repository")}
              </span>
              {aheadBehind && (aheadBehind.ahead ?? 0) > 0 && (
                <span className="text-[10px] font-medium text-green-600 dark:text-green-400">
                  ↑{aheadBehind.ahead}
                </span>
              )}
              {aheadBehind && (aheadBehind.behind ?? 0) > 0 && (
                <span className="text-[10px] font-medium text-amber-500">
                  ↓{aheadBehind.behind}
                </span>
              )}
              <ChevronsUpDownIcon
                data-icon="inline-end"
                className="opacity-50"
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
            <CommandInput placeholder="Search branch…" />
            <CommandList>
              <CommandEmpty>No branches found</CommandEmpty>
              <CommandGroup>
                {branches.map((b) => (
                  <CommandItem
                    key={b}
                    value={b}
                    data-checked={b === branch}
                    onSelect={() => {
                      onBranchSelect?.(b)
                      setOpen(false)
                    }}
                  >
                    {b}
                  </CommandItem>
                ))}
              </CommandGroup>
              {sessionId && (
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
                    ) : (
                      <CommandItem
                        disabled={initializeRepository.isPending}
                        onSelect={handleInitializeRepository}
                      >
                        <PlusIcon />
                        {initializeRepository.isPending
                          ? "Initializing repository…"
                          : "Initialize repository"}
                      </CommandItem>
                    )}
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
              disabled={!newBranch.trim() || createBranch.isPending}
            >
              {createBranch.isPending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
