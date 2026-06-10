import { useState } from "react"
import { FolderOpen, Trash2 } from "lucide-react"

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
import { useWorkspace } from "@/features/workspace"

import { SettingsGroup, SettingsRow } from "../components/settings-ui"

export function DataSection() {
  const { resetAll } = useWorkspace()
  const [showConfirm, setShowConfirm] = useState(false)
  const [resetting, setResetting] = useState(false)

  async function handleReset() {
    setResetting(true)
    try {
      await resetAll()
      setShowConfirm(false)
      await window.electronAPI?.restartServer()
      window.location.reload()
    } catch {
      setResetting(false)
    }
  }

  return (
    <>
      <SettingsGroup>
        <SettingsRow
          title="Data folder"
          description={<span className="font-mono">~/.lambda-code</span>}
        >
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.electronAPI?.openDataDir()}
          >
            <FolderOpen data-icon="inline-start" />
            Show in Finder
          </Button>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Danger zone">
        <SettingsRow
          title="Delete all data"
          description="Permanently removes all workspaces, threads, and messages. This cannot be undone."
        >
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setShowConfirm(true)}
          >
            <Trash2 data-icon="inline-start" />
            Delete all
          </Button>
        </SettingsRow>
      </SettingsGroup>

      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete all data?</DialogTitle>
            <DialogDescription>
              This will permanently delete all workspaces, threads, and
              messages. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
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
              {resetting ? "Deleting…" : "Delete all"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
