import { Button } from "@/shared/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"

import { useResetAllData } from "../use-reset-all-data"

/**
 * Confirmation for the "Delete all data" reset, shared by the Data and About
 * settings sections so both spell out the same consequences and run the same
 * (whole-app) reset.
 */
export function ResetAllDataDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { reset, resetting, error } = useResetAllData()

  async function handleReset() {
    const ok = await reset()
    if (ok) onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!resetting) onOpenChange(next)
      }}
    >
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Delete all data?</DialogTitle>
          <DialogDescription>
            This resets the app to a fresh install. Every workspace, thread,
            message, attachment, memory, automation, and all settings and
            sign-ins are permanently deleted, along with the app&rsquo;s managed
            worktrees and everything stored in{" "}
            <span className="font-mono">~/.lamda</span>. Your own project files
            are left untouched. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <DialogClose
            render={<Button variant="outline" />}
            disabled={resetting}
          >
            Cancel
          </DialogClose>
          <Button
            variant="destructive"
            onClick={handleReset}
            disabled={resetting}
          >
            {resetting ? "Deleting" : "Delete all"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
