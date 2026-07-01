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
import { Badge } from "@/shared/ui/badge"
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
      <section className="flex flex-col items-center gap-4 rounded-2xl border border-border/60 px-6 py-9 text-center">
        <LamdaMark className="size-16 rounded-2xl text-4xl shadow-sm ring-1 ring-border/50" />
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-semibold tracking-tight">Lamda</h2>
            <Badge variant="secondary" className="font-mono tabular-nums">
              {version}
            </Badge>
          </div>
          <p className="max-w-sm text-xs/relaxed text-muted-foreground">
            Local-first desktop workspace for AI-powered coding sessions
          </p>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => openExternal(GITHUB_URL)}
          >
            <ExternalLink data-icon="inline-start" />
            GitHub
          </Button>
          <Badge variant="outline" className="h-8 px-3 text-muted-foreground">
            {LICENSE} License
          </Badge>
        </div>
      </section>

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

      {/* Danger zone */}
      <section className="overflow-hidden rounded-xl border border-destructive/30 bg-destructive/5">
        <header className="flex items-center gap-2 border-b border-destructive/20 px-4 py-2.5">
          <AlertTriangle className="size-3.5 text-destructive" />
          <h2 className="text-sm font-medium tracking-tight text-destructive">
            Danger zone
          </h2>
        </header>
        <div className="flex items-center justify-between gap-6 px-4 py-3.5">
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-sm leading-snug">Delete all data</p>
            <p className="text-xs/relaxed text-muted-foreground">
              Permanently removes all workspaces, threads, and messages. This
              cannot be undone.
            </p>
          </div>
          <Button
            variant="destructive"
            size="sm"
            className="shrink-0"
            onClick={() => setShowConfirm(true)}
          >
            <Trash2 data-icon="inline-start" />
            Delete all
          </Button>
        </div>
      </section>

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
              {resetting ? "Deleting" : "Delete all"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** The Lamda brand mark — the Greek lambda in gold on a dark rounded tile
 * (matches the app favicon). */
function LamdaMark({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Lamda"
      className={cn(
        "flex select-none items-center justify-center bg-[#09090b] font-semibold leading-none text-[#d4a017]",
        className
      )}
    >
      Λ
    </span>
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
          Checking for updates
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
          <ProgressLabel>Downloading update</ProgressLabel>
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
