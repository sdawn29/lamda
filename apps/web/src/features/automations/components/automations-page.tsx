import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import {
  Plus,
  Play,
  MoreHorizontal,
  Pencil,
  Trash2,
  History,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react"
import { Button } from "@/shared/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu"
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
import { toast } from "sonner"
import { useWorkspace } from "@/features/workspace"
import {
  useAllAutomations,
  useCreateAutomation,
  useUpdateAutomation,
  useDeleteAutomation,
  useRunAutomation,
} from "../queries"
import { humanizeCron } from "../schedule"
import type { Automation, AutomationInput } from "../types"
import { AutomationFormDialog } from "./automation-form-dialog"
import { AutomationRunHistoryDialog } from "./automation-run-history-dialog"

export function AutomationsPage() {
  const { workspaces } = useWorkspace()
  const workspaceName = (id: string) =>
    workspaces.find((w) => w.id === id)?.name ?? "Unknown workspace"

  const { data: automations = [] } = useAllAutomations()
  const createMutation = useCreateAutomation()
  const updateMutation = useUpdateAutomation()
  const deleteMutation = useDeleteAutomation()
  const runMutation = useRunAutomation()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Automation | null>(null)
  const [historyFor, setHistoryFor] = useState<Automation | null>(null)
  const [deleting, setDeleting] = useState<Automation | null>(null)

  const openNew = () => {
    setEditing(null)
    setFormOpen(true)
  }
  const openEdit = (automation: Automation) => {
    setEditing(automation)
    setFormOpen(true)
  }

  const handleSave = (input: AutomationInput, workspaceId: string) => {
    if (editing) {
      updateMutation.mutate({ id: editing.id, updates: input })
    } else {
      createMutation.mutate(
        { workspaceId, input },
        {
          onError: (err) =>
            toast.error(
              err instanceof Error ? err.message : "Failed to create",
            ),
        },
      )
    }
  }

  const handleRun = (automation: Automation) => {
    runMutation.mutate(automation.id)
    toast.message(`Running "${automation.name}"…`)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3">
        <Clock className="size-4 text-muted-foreground" />
        <h1 className="text-sm font-semibold">Automations</h1>
        <Button
          size="sm"
          className="ml-auto h-7 gap-1.5 text-xs"
          onClick={openNew}
          disabled={workspaces.length === 0}
        >
          <Plus className="size-3.5" />
          New
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-5 py-4">
          <p className="mb-3 text-3xs text-muted-foreground/60">
            Automations run their prompt through the agent on a schedule. They
            fire only while the app is running.
          </p>

          {automations.length === 0 ? (
            <EmptyState onNew={openNew} disabled={workspaces.length === 0} />
          ) : (
            <div className="flex flex-col divide-y divide-border/60 rounded-lg border border-border">
              {automations.map((automation) => (
                <AutomationRow
                  key={automation.id}
                  automation={automation}
                  workspaceName={workspaceName(automation.workspaceId)}
                  onRun={() => handleRun(automation)}
                  onEdit={() => openEdit(automation)}
                  onHistory={() => setHistoryFor(automation)}
                  onDelete={() => setDeleting(automation)}
                  onToggle={(enabled) =>
                    updateMutation.mutate({
                      id: automation.id,
                      updates: { enabled },
                    })
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <AutomationFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        automation={editing}
        workspaces={workspaces}
        onSave={handleSave}
      />
      <AutomationRunHistoryDialog
        open={!!historyFor}
        onOpenChange={(open) => !open && setHistoryFor(null)}
        automation={historyFor}
      />
      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete automation?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleting?.name}" and its run history will be permanently deleted.
              The thread it created is kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleting(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleting) deleteMutation.mutate(deleting.id)
                setDeleting(null)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function AutomationRow({
  automation,
  workspaceName,
  onRun,
  onEdit,
  onHistory,
  onDelete,
  onToggle,
}: {
  automation: Automation
  workspaceName: string
  onRun: () => void
  onEdit: () => void
  onHistory: () => void
  onDelete: () => void
  onToggle: (enabled: boolean) => void
}) {
  const navigate = useNavigate()
  return (
    <div className="group flex items-center gap-3 px-3 py-2.5">
      <span
        className={`size-1.5 shrink-0 rounded-full ${
          automation.enabled ? "bg-green-500" : "bg-muted-foreground/30"
        }`}
        title={automation.enabled ? "Enabled" : "Disabled"}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2">
          <span className="truncate text-xs font-medium">{automation.name}</span>
          {!automation.enabled && (
            <span className="text-3xs text-muted-foreground/50">(off)</span>
          )}
          <span
            className="text-3xs text-muted-foreground/50"
            title={automation.cron}
          >
            {humanizeCron(automation.cron)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="shrink-0 truncate text-3xs text-muted-foreground/40">
            {workspaceName}
          </span>
          <span className="text-muted-foreground/30">·</span>
          <span className="truncate text-3xs text-muted-foreground/60">
            {automation.prompt}
          </span>
        </div>
      </div>

      <LastStatus
        automation={automation}
        onOpenThread={() =>
          automation.threadId &&
          navigate({
            to: "/workspace/$threadId",
            params: { threadId: automation.threadId },
          })
        }
      />

      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
        onClick={onRun}
        disabled={automation.lastStatus === "running"}
      >
        <Play className="size-3.5" />
        Run
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 px-0 text-muted-foreground/60 hover:text-foreground"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          }
        >
          <span className="sr-only">Options</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="mr-2 size-3.5" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onHistory}>
            <History className="mr-2 size-3.5" />
            Run history
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onToggle(!automation.enabled)}>
            <Clock className="mr-2 size-3.5" />
            {automation.enabled ? "Disable" : "Enable"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="mr-2 size-3.5" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function LastStatus({
  automation,
  onOpenThread,
}: {
  automation: Automation
  onOpenThread: () => void
}) {
  const { lastStatus, lastError, threadId } = automation
  const base = "flex shrink-0 items-center gap-1 text-3xs"
  if (!lastStatus)
    return <span className={`${base} text-muted-foreground/40`}>never run</span>

  const content =
    lastStatus === "running" ? (
      <>
        <Loader2 className="size-3 animate-spin" /> running
      </>
    ) : lastStatus === "ok" ? (
      <>
        <CheckCircle2 className="size-3 text-green-500" /> ok
      </>
    ) : (
      <>
        <XCircle className="size-3 text-red-500" /> failed
      </>
    )

  return (
    <button
      className={`${base} text-muted-foreground/70 hover:text-foreground disabled:hover:text-muted-foreground/70`}
      onClick={onOpenThread}
      disabled={!threadId}
      title={lastError ?? (threadId ? "Open thread" : undefined)}
    >
      {content}
    </button>
  )
}

function EmptyState({
  onNew,
  disabled,
}: {
  onNew: () => void
  disabled: boolean
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-12 text-center">
      <div className="flex size-10 items-center justify-center rounded-xl border border-border/50 bg-muted/50">
        <Clock className="size-4 text-muted-foreground/60" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium">No automations yet</p>
        <p className="text-3xs text-muted-foreground/60">
          Schedule a prompt to run the agent automatically.
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="h-7 gap-1.5 text-xs"
        onClick={onNew}
        disabled={disabled}
      >
        <Plus className="size-3.5" />
        New automation
      </Button>
    </div>
  )
}
