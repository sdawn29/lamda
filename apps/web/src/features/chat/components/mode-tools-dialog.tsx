import * as React from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { ListChecksIcon } from "lucide-react"
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip"

interface ModeToolsDialogProps {
  mode: ModeDto | undefined
  workspaceId?: string
}

function sameTools(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false
  const rightSet = new Set(right)
  return left.every((tool) => rightSet.has(tool))
}

/** Compact composer entry point for editing the active mode's tool allowlist. */
export function ModeToolsDialog({ mode, workspaceId }: ModeToolsDialogProps) {
  const queryClient = useQueryClient()
  const [open, setOpen] = React.useState(false)
  const [tools, setTools] = React.useState<string[]>([])
  const { data: catalog = [], isLoading: catalogLoading } = useToolCatalog(
    workspaceId,
    open
  )

  const resetDraft = React.useCallback(() => {
    setTools(mode ? [...mode.tools] : [])
  }, [mode])

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) resetDraft()
      setOpen(nextOpen)
    },
    [resetDraft]
  )

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
      setOpen(false)
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
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Customize allowed tools"
              disabled={!mode}
              className="text-muted-foreground hover:text-foreground"
              onClick={() => handleOpenChange(true)}
            >
              <ListChecksIcon />
            </Button>
          }
        />
        <TooltipContent>Customize allowed tools</TooltipContent>
      </Tooltip>

      <Dialog open={open} onOpenChange={handleOpenChange}>
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
                onClick={() => setOpen(false)}
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
    </>
  )
}
