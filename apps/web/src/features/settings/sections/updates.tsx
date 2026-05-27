import { AlertTriangle, Check, Download, RefreshCw } from "lucide-react"

import { Alert, AlertDescription } from "@/shared/ui/alert"
import { Button } from "@/shared/ui/button"
import { Card, CardContent } from "@/shared/ui/card"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldTitle,
} from "@/shared/ui/field"
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/shared/ui/progress"
import { Separator } from "@/shared/ui/separator"
import {
  useCheckForUpdates,
  useDownloadUpdate,
  useElectronUpdateStatus,
  useInstallUpdate,
  type ElectronUpdateStatus,
} from "@/features/electron"
import { cn } from "@/shared/lib/utils"

export function UpdatesSection() {
  const { data: status } = useElectronUpdateStatus()
  const checkForUpdates = useCheckForUpdates()
  const downloadUpdate = useDownloadUpdate()
  const installUpdate = useInstallUpdate()
  const isElectron = !!window.electronAPI

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 px-4 py-0">
        <Field orientation="horizontal">
          <FieldContent>
            <FieldTitle>Current version</FieldTitle>
            <FieldDescription>
              {import.meta.env.DEV ? "dev build" : `v${__APP_VERSION__}`}
            </FieldDescription>
          </FieldContent>
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
                  (checkForUpdates.isPending || status?.phase === "checking") &&
                    "animate-spin"
                )}
              />
              Check for updates
            </Button>
          )}
        </Field>

        {isElectron && status && status.phase !== "idle" && (
          <>
            <Separator />
            <UpdateStatusRow
              status={status}
              onDownload={() => downloadUpdate.mutate()}
              onInstall={() => installUpdate.mutate()}
              isDownloading={downloadUpdate.isPending}
            />
          </>
        )}
      </CardContent>
    </Card>
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
