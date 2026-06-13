import { useState } from "react"
import {
  AlertTriangle,
  Check,
  Download,
  ExternalLink,
  FolderOpen,
  RefreshCw,
  Trash2,
} from "lucide-react"

import { Alert, AlertDescription } from "@/shared/ui/alert"
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
import { Progress, ProgressLabel, ProgressValue } from "@/shared/ui/progress"
import {
  ReleaseNotes,
  useCheckForUpdates,
  useDownloadUpdate,
  useElectronUpdateStatus,
  useInstallUpdate,
  type ElectronUpdateStatus,
} from "@/features/electron"
import { openExternal } from "@/features/electron/api"
import { useWorkspace } from "@/features/workspace"
import { cn } from "@/shared/lib/utils"

import {
  SettingsGroup,
  SettingsRow,
  SettingsStack,
} from "../components/settings-ui"

const GITHUB_URL = "https://github.com/sdawn29/lambda"
const LICENSE = "MIT"

export function AboutSection() {
  const { data: status } = useElectronUpdateStatus()
  const checkForUpdates = useCheckForUpdates()
  const downloadUpdate = useDownloadUpdate()
  const installUpdate = useInstallUpdate()
  const isElectron = !!window.electronAPI

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

  const version = import.meta.env.DEV ? "dev build" : `v${__APP_VERSION__}`

  return (
    <>
      {/* App identity */}
      <SettingsGroup title="App">
        <SettingsRow
          title="Name"
          description="Local-first desktop workspace for AI-powered coding sessions"
        >
          <span className="text-sm font-semibold">Lamda</span>
        </SettingsRow>
        <SettingsRow title="Version" description="Current installed version">
          <span className="font-mono text-sm">{version}</span>
        </SettingsRow>
        <SettingsRow title="License">
          <span className="font-mono text-sm">{LICENSE}</span>
        </SettingsRow>
        <SettingsRow title="Source code" description="View on GitHub">
          <Button
            variant="outline"
            size="sm"
            onClick={() => openExternal(GITHUB_URL)}
          >
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            GitHub
          </Button>
        </SettingsRow>
      </SettingsGroup>

      {/* Updates */}
      <SettingsGroup title="Updates">
        <SettingsRow
          title="Check for updates"
          description={
            isElectron
              ? "Download and install the latest release automatically."
              : "Update checking is only available in the desktop app."
          }
        >
          {isElectron && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => checkForUpdates.mutate()}
              disabled={
                checkForUpdates.isPending ||
                status?.phase === "checking" ||
                status?.phase === "downloading"
              }
            >
              <RefreshCw
                className={cn(
                  "mr-1.5 h-3.5 w-3.5",
                  (checkForUpdates.isPending ||
                    status?.phase === "checking") &&
                    "animate-spin"
                )}
              />
              Check for updates
            </Button>
          )}
        </SettingsRow>

        {isElectron && status && status.phase !== "idle" && (
          <div className="py-3.5">
            <UpdateStatusRow
              status={status}
              onDownload={() => downloadUpdate.mutate()}
              onInstall={() => installUpdate.mutate()}
              isDownloading={downloadUpdate.isPending}
            />
          </div>
        )}

        {isElectron && hasChangelog(status) && (
          <SettingsStack title={`What's new in v${status.version}`}>
            <ReleaseNotes notes={status.releaseNotes} />
          </SettingsStack>
        )}
      </SettingsGroup>

      {/* Data */}
      <SettingsGroup title="Data">
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

function hasChangelog(
  status: ElectronUpdateStatus | undefined
): status is Extract<
  ElectronUpdateStatus,
  { phase: "available" | "downloading" | "ready" }
> {
  return (
    status?.phase === "available" ||
    status?.phase === "downloading" ||
    status?.phase === "ready"
  )
}

function UpdateStatusRow({
  status,
  onDownload,
  onInstall,
  isDownloading,
}: {
  status: ElectronUpdateStatus
  onDownload: () => void
  onInstall: () => void
  isDownloading: boolean
}) {
  switch (status.phase) {
    case "idle":
      return null
    case "checking":
      return (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          Checking for updates…
        </div>
      )
    case "available":
      return (
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs">
            <Download className="h-3.5 w-3.5 text-primary" />
            <span>
              Version <strong>{status.version}</strong> is available
            </span>
          </div>
          <Button size="sm" onClick={onDownload} disabled={isDownloading}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Download
          </Button>
        </div>
      )
    case "downloading":
      return (
        <Progress value={status.percent} className="flex-col gap-1.5">
          <ProgressLabel>Downloading update…</ProgressLabel>
          <ProgressValue>
            {() => `${Math.round(status.percent)}%`}
          </ProgressValue>
        </Progress>
      )
    case "ready":
      return (
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs">
            <Check className="h-3.5 w-3.5 text-green-500" />
            <span>
              Version <strong>{status.version}</strong> ready to install
            </span>
          </div>
          <Button size="sm" onClick={onInstall}>
            Restart & install
          </Button>
        </div>
      )
    case "error":
      return (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertDescription className="truncate">
            {status.message}
          </AlertDescription>
        </Alert>
      )
  }
}
