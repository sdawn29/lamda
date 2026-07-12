import * as React from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { ToolPicker } from "@/features/settings/components/tool-picker"
import { saveMode, type ModeDto } from "@/features/workspace/api"
import { modeKeys, useToolCatalog } from "@/features/workspace/queries"
import { Button } from "@/shared/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"

interface ModeToolsDialogProps {
  mode: ModeDto | undefined
  workspaceId?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

function sameTools(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false
  const rightSet = new Set(right)
  return left.every((tool) => rightSet.has(tool))
}

/** Dialog for editing the active mode's tool allowlist — opened from the composer settings menu. */
export function ModeToolsDialog({
  mode,
  workspaceId,
  open,
  onOpenChange,
}: ModeToolsDialogProps) {
  const queryClient = useQueryClient()
  const [tools, setTools] = React.useState<string[]>([])
  const { data: catalog = [], isLoading: catalogLoading } = useToolCatalog(
    workspaceId,
    open
  )

  // Seed the draft from the active mode on each open (adjust-during-render so
  // the first open frame already shows the mode's current allowlist).
  const [wasOpen, setWasOpen] = React.useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setTools(mode ? [...mode.tools] : [])
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!mode) throw new Error("The selected mode is no longer available.")
      return saveMode(mode.id, {
        scope: mode.source === "local" ? "local" : "global",
        workspaceId: mode.source === "local" ? workspaceId : undefined,
        name: mode.label,
        description: mode.description,
        tools,
        agents: mode.agents,
        color: mode.color,
        icon: mode.icon,
        preamble: mode.preamble,
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: modeKeys.all })
      onOpenChange(false)
      toast.success(`${mode?.label ?? "Mode"} tools updated`)
    },
    onError: (error) => {
      toast.error("Couldn't update allowed tools", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      })
    },
  })

  const unchanged = mode ? sameTools(tools, mode.tools) : true
  const scopeLabel =
    mode?.source === "local" ? "this workspace" : "all workspaces"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(80vh,44rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{mode?.label ?? "Mode"} tools</DialogTitle>
          <DialogDescription>
            Choose which tools are available in this mode. Changes apply to{" "}
            {scopeLabel}.
          </DialogDescription>
        </DialogHeader>

        {catalogLoading ? (
          <p className="py-8 text-center text-muted-foreground">
            Loading tools…
          </p>
        ) : (
          <ToolPicker
            key={mode?.id}
            groups={catalog}
            selected={tools}
            onChange={setTools}
          />
        )}

        <DialogFooter className="items-center sm:justify-between">
          <span className="text-muted-foreground">
            {tools.length === 0
              ? "Allow at least one tool."
              : `${tools.length} allowlist ${tools.length === 1 ? "entry" : "entries"}`}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={tools.length === 0 || unchanged || save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? "Saving…" : "Save tools"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
