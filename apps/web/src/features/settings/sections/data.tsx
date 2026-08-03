import { useState } from "react"
import { FolderOpen, Trash2 } from "lucide-react"

import { Button } from "@/shared/ui/button"

import { ResetAllDataDialog } from "../components/reset-all-data-dialog"
import { SettingsGroup, SettingsRow } from "../components/settings-ui"

export function DataSection() {
  const [showConfirm, setShowConfirm] = useState(false)

  return (
    <>
      <SettingsGroup>
        <SettingsRow
          title="Data folder"
          description={<span className="font-mono">~/.lamda</span>}
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
          description="Resets the app to a fresh install: removes every workspace, thread, message, memory, automation, and all settings. This cannot be undone."
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

      <ResetAllDataDialog open={showConfirm} onOpenChange={setShowConfirm} />
    </>
  )
}
