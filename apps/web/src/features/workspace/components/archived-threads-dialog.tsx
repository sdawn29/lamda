import { useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Archive,
  ArchiveRestore,
  Clock,
  FolderOpen,
  Search,
  Trash2,
} from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog"
import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import { Input } from "@/shared/ui/input"
import { Separator } from "@/shared/ui/separator"
import { Skeleton } from "@/shared/ui/skeleton"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/shared/ui/tooltip"
import {
  listArchivedThreads,
  unarchiveThread,
  deleteThread,
  type ArchivedThreadDto,
} from "../api"
import { workspacesQueryKey } from "../queries"

const archivedQueryKey = ["threads", "archived"] as const

function useArchivedThreads() {
  return useQuery({
    queryKey: archivedQueryKey,
    queryFn: async () => {
      const { threads } = await listArchivedThreads()
      return threads
    },
  })
}

function relativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function ThreadItemSkeleton() {
  return (
    <div className="flex items-center gap-3 px-2 py-2">
      <Skeleton className="size-7 shrink-0 rounded-md" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <Skeleton className="h-3 w-3/5 rounded" />
        <Skeleton className="h-2.5 w-2/5 rounded" />
      </div>
      <div className="flex shrink-0 gap-1">
        <Skeleton className="size-6 rounded-md" />
        <Skeleton className="size-6 rounded-md" />
      </div>
    </div>
  )
}

function EmptyState({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <div className="flex size-10 items-center justify-center rounded-full bg-muted">
        <Archive className="size-5 text-muted-foreground" />
      </div>
      {query ? (
        <>
          <p className="text-xs font-medium">No results for &ldquo;{query}&rdquo;</p>
          <p className="text-xs text-muted-foreground">Try a different search term.</p>
        </>
      ) : (
        <>
          <p className="text-xs font-medium">No archived threads</p>
          <p className="text-xs text-muted-foreground">
            Threads you archive will appear here.
          </p>
        </>
      )}
    </div>
  )
}

function ArchivedThreadItem({
  thread,
  onRestore,
  onDelete,
}: {
  thread: ArchivedThreadDto
  onRestore: () => void
  onDelete: () => void
}) {
  const restoreButton = (
    <Button variant="ghost" size="icon-sm" onClick={onRestore}>
      <ArchiveRestore className="size-3.5" />
      <span className="sr-only">Restore thread</span>
    </Button>
  )

  const deleteButton = (
    <Button
      variant="ghost"
      size="icon-sm"
      className="text-destructive/60 hover:text-destructive"
      onClick={onDelete}
    >
      <Trash2 className="size-3.5" />
      <span className="sr-only">Delete permanently</span>
    </Button>
  )

  return (
    <div className="group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/50">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Archive className="size-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium leading-5 text-foreground">
          {thread.title}
        </p>
        <div className="flex items-center gap-1 text-[0.65rem] text-muted-foreground">
          <FolderOpen className="size-3 shrink-0" />
          <span className="max-w-32 truncate">{thread.workspaceName}</span>
          <span className="text-muted-foreground/40">·</span>
          <Clock className="size-3 shrink-0" />
          <span className="shrink-0">{relativeTime(thread.createdAt)}</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <Tooltip>
          <TooltipTrigger render={restoreButton} />
          <TooltipContent side="top">Restore thread</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger render={deleteButton} />
          <TooltipContent side="top">Delete permanently</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}

export function ArchivedThreadsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const { data: threads = [], isLoading } = useArchivedThreads()
  const [search, setSearch] = useState("")
  const [pendingDelete, setPendingDelete] = useState<ArchivedThreadDto | null>(
    null
  )
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false)
  const [isDeletingAll, setIsDeletingAll] = useState(false)

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: archivedQueryKey })
    queryClient.invalidateQueries({ queryKey: workspacesQueryKey })
  }

  async function handleRestore(thread: ArchivedThreadDto) {
    await unarchiveThread(thread.id)
    invalidate()
  }

  async function handleDelete() {
    if (!pendingDelete) return
    await deleteThread(pendingDelete.id)
    setPendingDelete(null)
    invalidate()
  }

  async function handleDeleteAll() {
    setIsDeletingAll(true)
    try {
      await Promise.all(threads.map((t) => deleteThread(t.id)))
    } finally {
      setIsDeletingAll(false)
      setConfirmDeleteAll(false)
      invalidate()
    }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return threads
    const q = search.toLowerCase()
    return threads.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.workspaceName.toLowerCase().includes(q)
    )
  }, [threads, search])

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="gap-0 p-0 sm:max-w-lg">
          <DialogHeader className="px-4 pb-3 pt-4">
            <div className="flex items-center gap-2">
              <DialogTitle>Archived Threads</DialogTitle>
              {!isLoading && threads.length > 0 && (
                <Badge variant="secondary">{threads.length}</Badge>
              )}
            </div>
            <DialogDescription>
              Archived threads are hidden from the sidebar but not deleted.
            </DialogDescription>
          </DialogHeader>

          <Separator />

          <div className="px-3 py-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by title or workspace"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-7 text-xs"
              />
            </div>
          </div>

          <Separator />

          <div className="max-h-72 min-h-0 overflow-y-auto px-1 py-1">
            {isLoading ? (
              <div className="space-y-0.5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <ThreadItemSkeleton key={i} />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState query={search} />
            ) : (
              filtered.map((thread) => (
                <ArchivedThreadItem
                  key={thread.id}
                  thread={thread}
                  onRestore={() => handleRestore(thread)}
                  onDelete={() => setPendingDelete(thread)}
                />
              ))
            )}
          </div>

          <Separator />

          <DialogFooter showCloseButton className="px-4 py-3">
            {!isLoading && threads.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive/70 hover:text-destructive sm:mr-auto"
                onClick={() => setConfirmDeleteAll(true)}
              >
                <Trash2 className="size-3.5" />
                Delete all
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10">
              <Trash2 className="size-4 text-destructive" />
            </AlertDialogMedia>
            <AlertDialogTitle>Delete thread?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{pendingDelete?.title}&rdquo; will be permanently deleted.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmDeleteAll}
        onOpenChange={(open) => {
          if (!open && !isDeletingAll) setConfirmDeleteAll(false)
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10">
              <Trash2 className="size-4 text-destructive" />
            </AlertDialogMedia>
            <AlertDialogTitle>Delete all archived threads?</AlertDialogTitle>
            <AlertDialogDescription>
              All {threads.length} archived thread
              {threads.length === 1 ? "" : "s"} will be permanently deleted.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingAll}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeletingAll}
              onClick={(e) => {
                e.preventDefault()
                handleDeleteAll()
              }}
            >
              {isDeletingAll ? "Deleting" : "Delete all"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
