import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Textarea } from "@/shared/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select"
import { FieldError } from "@/shared/ui/field"
import { TASK_ICONS, TaskIcon, type TaskIconId } from "../icons"
import type { WorkspaceTask } from "../types"

interface TaskFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  task?: WorkspaceTask | null
  onSave: (data: Omit<WorkspaceTask, "id">) => void
}

export function TaskFormDialog({ open, onOpenChange, task, onSave }: TaskFormDialogProps) {
  const [icon, setIcon] = useState<TaskIconId>("terminal")
  const [name, setName] = useState("")
  const [command, setCommand] = useState("")
  const [errors, setErrors] = useState<{ command?: string }>({})

  const syncFromTask = () => {
    setIcon((task?.icon as TaskIconId) ?? "terminal")
    setName(task?.name ?? "")
    setCommand(task?.command ?? "")
    setErrors({})
  }

  useEffect(() => {
    if (open) syncFromTask()
  }, [open, task])

  const handleOpenChange = (next: boolean) => {
    if (!next) syncFromTask()
    onOpenChange(next)
  }

  const handleSave = () => {
    if (!command.trim()) {
      setErrors({ command: "Command is required" })
      return
    }
    onSave({ icon, name: name.trim() || null, command: command.trim() })
    handleOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-[400px]">
        <DialogHeader className="border-b px-4 pt-4 pb-3">
          <DialogTitle className="text-sm font-semibold">
            {task ? "Edit task" : "New task"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 px-4 py-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium">Icon</label>
            <Select value={icon} onValueChange={(v) => setIcon(v as TaskIconId)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue>
                  <span className="flex items-center gap-2">
                    <TaskIcon id={icon} />
                    {TASK_ICONS.find((i) => i.id === icon)?.label}
                  </span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {TASK_ICONS.map(({ id, label, Icon }) => (
                  <SelectItem key={id} value={id}>
                    <span className="flex items-center gap-2">
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      {label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="task-name" className="text-xs font-medium">
              Name
            </label>
            <Input
              id="task-name"
              autoFocus
              placeholder="Start dev server"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-8 text-xs"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="task-command" className="text-xs font-medium">
              Command <span className="text-destructive">*</span>
            </label>
            <Textarea
              id="task-command"
              placeholder="npm run dev"
              value={command}
              onChange={(e) => {
                setCommand(e.target.value)
                setErrors({})
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSave()
              }}
              aria-invalid={!!errors.command}
              className="min-h-[72px] resize-none font-mono text-xs"
              rows={3}
            />
            {errors.command && <FieldError>{errors.command}</FieldError>}
          </div>
        </div>

        <div className="flex items-center justify-between border-t bg-muted/20 px-4 py-2.5">
          <Button variant="ghost" size="sm" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <div className="flex items-center gap-2.5">
            <span className="text-3xs text-muted-foreground/40 select-none">⌘↵</span>
            <Button size="sm" onClick={handleSave}>
              {task ? "Update" : "Create"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
