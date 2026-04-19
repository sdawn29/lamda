import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArchiveRestore, Folder, Trash2 } from "lucide-react"
import { Button } from "@/shared/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
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

function ArchivedThreadItem({
  thread,
  onRestore,
  onDelete,
}: {
  thread: ArchivedThreadDto
  onRestore: () => void
  onDelete: () => void
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border p-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {thread.title}
        </p>
        <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          <Folder className="h-3 w-3 shrink-0" />
          <span className="truncate">{thread.workspaceName}</span>
          <span className="shrink-0 text-muted-foreground/50">·</span>
          <span className="shrink-0">{relativeTime(thread.createdAt)}</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          title="Restore thread"
          onClick={onRestore}
        >
          <ArchiveRestore className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          title="Delete permanently"
          className="text-destructive hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
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

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: archivedQueryKey })
    queryClient.invalidateQueries({ queryKey: workspacesQueryKey })
  }

  async function handleRestore(thread: ArchivedThreadDto) {
    await unarchiveThread(thread.id)
    invalidate()
  }

  async function handleDelete(thread: ArchivedThreadDto) {
    await deleteThread(thread.id)
    invalidate()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Archived Threads</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Loading…
          </p>
        ) : threads.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No archived threads.
          </p>
        ) : (
          <div className="flex max-h-96 flex-col gap-2 overflow-y-auto">
            {threads.map((thread) => (
              <ArchivedThreadItem
                key={thread.id}
                thread={thread}
                onRestore={() => handleRestore(thread)}
                onDelete={() => handleDelete(thread)}
              />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
