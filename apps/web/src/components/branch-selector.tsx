import * as React from "react"
import { GitBranchIcon, ChevronsUpDownIcon, PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useCreateBranch } from "@/mutations/use-create-branch"

interface BranchSelectorProps {
  branch: string | null
  branches: string[]
  onBranchSelect?: (branch: string) => void
  sessionId?: string
}

export function BranchSelector({
  branch,
  branches,
  onBranchSelect,
  sessionId,
}: BranchSelectorProps) {
  const [open, setOpen] = React.useState(false)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [newBranch, setNewBranch] = React.useState("")

  const createBranch = useCreateBranch(sessionId ?? "")

  function handleCreate() {
    if (!newBranch.trim() || !sessionId) return
    createBranch.mutate(newBranch.trim(), {
      onSuccess: (data) => {
        onBranchSelect?.(data.branch ?? newBranch.trim())
        setDialogOpen(false)
        setNewBranch("")
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
              <span className="max-w-32 truncate">{branch ?? "no branch"}</span>
              <ChevronsUpDownIcon
                data-icon="inline-end"
                className="opacity-50"
              />
            </Button>
          }
        />
        <PopoverContent
          className="w-48 p-0"
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
                    <CommandItem
                      onSelect={() => {
                        setOpen(false)
                        setDialogOpen(true)
                      }}
                    >
                      <PlusIcon />
                      Create new branch
                    </CommandItem>
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
