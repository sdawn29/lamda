import { useQueryClient } from "@tanstack/react-query"
import { AlertCircle, Loader2, RefreshCw } from "lucide-react"
import { useState } from "react"

import { resetServerUrl } from "@/shared/lib/client"
import { Button } from "@/shared/ui/button"

import { restartServer, type ElectronServerStatus } from "./api"
import { electronKeys } from "./queries"

type Props = {
  status: ElectronServerStatus
}

export function ServerUnavailable({ status }: Props) {
  const queryClient = useQueryClient()
  const [isRetrying, setIsRetrying] = useState(false)
  const isStarting = status.status === "starting" || isRetrying
  const isFailed = status.status === "failed" && !isRetrying

  async function handleRetry() {
    if (isStarting) return
    setIsRetrying(true)
    try {
      const next = await restartServer()
      queryClient.setQueryData(electronKeys.serverStatus, next)
      queryClient.setQueryData(electronKeys.serverPort, next.port)
      if (next.status === "ready") {
        resetServerUrl()
        await queryClient.invalidateQueries()
      }
    } finally {
      setIsRetrying(false)
    }
  }

  function handleQuit() {
    window.close()
  }

  return (
    <div className="flex h-svh w-full items-center justify-center bg-background p-6">
      <div className="w-full max-w-xl rounded-lg border border-border bg-card p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div
            className={`mt-0.5 ${isFailed ? "text-destructive" : "text-muted-foreground"}`}
          >
            {isFailed ? (
              <AlertCircle className="size-5" />
            ) : (
              <Loader2 className="size-5 animate-spin" />
            )}
          </div>
          <div className="flex-1">
            <h1 className="text-base font-semibold text-foreground">
              {isFailed
                ? "Couldn\u2019t start the local server"
                : "Starting the local server\u2026"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {isFailed
                ? "The app needs a local server to store workspaces and run sessions. It failed to launch \u2014 most likely the packaged build is missing native modules."
                : "This usually takes a second. The app will continue once the server is ready."}
            </p>
          </div>
        </div>

        {isFailed && status.error ? (
          <pre className="mt-4 max-h-64 overflow-auto rounded-md border border-border bg-muted/40 p-3 text-xs leading-relaxed wrap-break-word whitespace-pre-wrap text-muted-foreground">
            {status.error}
          </pre>
        ) : null}

        {isFailed ? (
          <div className="mt-5 flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={handleQuit}>
              Quit
            </Button>
            <Button onClick={handleRetry}>
              <RefreshCw className="size-4" />
              Retry
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
