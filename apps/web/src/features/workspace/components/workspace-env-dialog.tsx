import { useState, useEffect } from "react"
import { Plus, Trash2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/shared/ui/dialog"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { useUpdateWorkspaceEnv } from "../mutations"
import type { WorkspaceDto } from "../api"

interface EnvRow {
  key: string
  value: string
}

function envToRows(env: Record<string, string>): EnvRow[] {
  return Object.entries(env).map(([key, value]) => ({ key, value }))
}

function rowsToEnv(rows: EnvRow[]): Record<string, string> {
  const result: Record<string, string> = {}
  for (const { key, value } of rows) {
    if (key.trim()) result[key.trim()] = value
  }
  return result
}

interface WorkspaceEnvDialogProps {
  workspace: WorkspaceDto
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function WorkspaceEnvDialog({ workspace, open, onOpenChange }: WorkspaceEnvDialogProps) {
  const [rows, setRows] = useState<EnvRow[]>([])
  const updateEnv = useUpdateWorkspaceEnv()

  useEffect(() => {
    if (open) {
      const initial = envToRows(workspace.env ?? {})
      setRows(initial.length > 0 ? initial : [])
    }
  }, [open, workspace.env])

  function addRow() {
    setRows((prev) => [...prev, { key: "", value: "" }])
  }

  function updateRow(index: number, field: "key" | "value", val: string) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: val } : r)))
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index))
  }

  function handleSave() {
    updateEnv.mutate(
      { workspaceId: workspace.id, env: rowsToEnv(rows) },
      { onSuccess: () => onOpenChange(false) }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Environment Variables</DialogTitle>
          <DialogDescription>
            Variables are injected into every Claude session for this workspace.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 py-1">
          {rows.length > 0 && (
            <div className="grid grid-cols-[1fr_1fr_auto] gap-2 px-0.5 pb-0.5">
              <span className="text-xs font-medium text-muted-foreground">Key</span>
              <span className="text-xs font-medium text-muted-foreground">Value</span>
              <span />
            </div>
          )}
          {rows.map((row, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
              <Input
                value={row.key}
                onChange={(e) => updateRow(i, "key", e.target.value)}
                placeholder="VARIABLE_NAME"
                className="font-mono text-xs h-8"
                spellCheck={false}
              />
              <Input
                value={row.value}
                onChange={(e) => updateRow(i, "value", e.target.value)}
                placeholder="value"
                className="font-mono text-xs h-8"
                spellCheck={false}
              />
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => removeRow(i)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="mt-1 w-fit gap-1.5 text-xs"
            onClick={addRow}
          >
            <Plus className="h-3.5 w-3.5" />
            Add variable
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={updateEnv.isPending}>
            {updateEnv.isPending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
