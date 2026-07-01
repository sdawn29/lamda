import { useState } from "react"
import { Play, Plus, Pencil, Trash2, KeyRound, ChevronDown } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu"
import { Button } from "@/shared/ui/button"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/shared/ui/tooltip"
import { cn } from "@/shared/lib/utils"
import { useTasks, useCreateTask, useUpdateTask, useDeleteTask } from "../queries"
import { useLastUsedTaskStore } from "../last-used-store"
import { TaskIcon } from "../icons"
import { TaskFormDialog } from "./task-form-dialog"
import { WorkspaceEnvDialog } from "@/features/workspace/components/workspace-env-dialog"
import { useWorkspace } from "@/features/workspace"
import type { WorkspaceTask } from "../types"

interface TasksDropdownProps {
  workspaceId: string
  onRunTask: (command: string) => void
  isMobile?: boolean
}

export function TasksDropdown({
  workspaceId,
  onRunTask,
  isMobile = false,
}: TasksDropdownProps) {
  const { data: tasks = [] } = useTasks(workspaceId)
  const createTask = useCreateTask(workspaceId)
  const updateTask = useUpdateTask(workspaceId)
  const deleteTask = useDeleteTask(workspaceId)
  const { workspaces } = useWorkspace()
  const workspace = workspaces.find((w) => w.id === workspaceId) ?? null

  const lastUsedId = useLastUsedTaskStore((s) => s.lastUsed[workspaceId])
  const setLastUsed = useLastUsedTaskStore((s) => s.setLastUsed)
  const lastUsedTask =
    tasks.find((t) => t.id === lastUsedId) ?? tasks[0] ?? null

  const runTask = (task: WorkspaceTask) => {
    setLastUsed(workspaceId, task.id)
    onRunTask(task.command)
  }

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<WorkspaceTask | null>(null)
  const [envOpen, setEnvOpen] = useState(false)

  const openNew = () => {
    setEditing(null)
    setFormOpen(true)
  }

  const openEdit = (task: WorkspaceTask) => {
    setEditing(task)
    setFormOpen(true)
  }

  const handleSave = (data: Omit<WorkspaceTask, "id">) => {
    if (editing) {
      updateTask.mutate({ id: editing.id, updates: data })
    } else {
      createTask.mutate(data)
    }
  }

  return (
    <>
      <div className="flex items-center gap-0.5" aria-label="Run task">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                className={cn(
                  "h-7 rounded-md text-muted-foreground hover:text-foreground",
                  isMobile ? "w-7 px-0" : "gap-1.5 px-2"
                )}
                disabled={!lastUsedTask}
                onClick={() => lastUsedTask && runTask(lastUsedTask)}
              >
                {lastUsedTask ? (
                  <>
                    <TaskIcon
                      id={lastUsedTask.icon}
                      className="shrink-0 text-muted-foreground"
                    />
                    {!isMobile && (
                      <span className="max-w-32 truncate whitespace-nowrap text-xs font-medium">
                        {lastUsedTask.name || lastUsedTask.command}
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <Play className="size-4" />
                    {!isMobile && (
                      <span className="whitespace-nowrap text-xs font-medium">
                        Tasks
                      </span>
                    )}
                  </>
                )}
              </Button>
            }
          />
          <TooltipContent>
            {lastUsedTask
              ? `Run ${lastUsedTask.name || lastUsedTask.command}`
              : "Tasks"}
          </TooltipContent>
        </Tooltip>

        <div className="h-3.5 w-px shrink-0 bg-border/70" />

        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Choose task"
            render={
              <Button
                variant="ghost"
                className="h-7 w-5 px-0 text-muted-foreground/70 hover:text-foreground"
              >
                <ChevronDown className="size-3.5" />
              </Button>
            }
          >
            <span className="sr-only">Choose task</span>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-60">
          {tasks.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              No tasks yet
            </div>
          ) : (
            tasks.map((task) => (
              <div
                key={task.id}
                className="group flex items-center gap-2 px-2 py-1 rounded-sm hover:bg-accent cursor-pointer"
                onClick={() => runTask(task)}
              >
                <TaskIcon id={task.icon} className="shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-xs">
                  {task.name || task.command}
                </span>
                <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100">
                  <button
                    className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/60 hover:bg-background hover:text-foreground"
                    onClick={(e) => { e.stopPropagation(); openEdit(task) }}
                    title="Edit"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/60 hover:bg-background hover:text-destructive"
                    onClick={(e) => { e.stopPropagation(); deleteTask.mutate(task.id) }}
                    title="Delete"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))
          )}

          <DropdownMenuSeparator />

          <div
            className="flex items-center gap-2 px-2 py-1 rounded-sm hover:bg-accent cursor-pointer text-muted-foreground hover:text-foreground"
            onClick={openNew}
          >
            <Plus className="h-3.5 w-3.5 shrink-0" />
            <span className="text-xs">New task</span>
          </div>

          {workspace && (
            <div
              className="flex items-center gap-2 px-2 py-1 rounded-sm hover:bg-accent cursor-pointer text-muted-foreground hover:text-foreground"
              onClick={() => setEnvOpen(true)}
            >
              <KeyRound className="h-3.5 w-3.5 shrink-0" />
              <span className="text-xs">Environment variables</span>
            </div>
          )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <TaskFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        task={editing}
        onSave={handleSave}
      />

      {workspace && (
        <WorkspaceEnvDialog
          workspace={workspace}
          open={envOpen}
          onOpenChange={setEnvOpen}
        />
      )}
    </>
  )
}
