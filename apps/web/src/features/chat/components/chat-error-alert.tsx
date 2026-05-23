import { useEffect, useLayoutEffect, useRef } from "react"
import { AlertCircleIcon, RotateCwIcon, WifiOffIcon, XIcon } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { cn } from "@/shared/lib/utils"
import type { ErrorAction, ErrorMessage } from "../types"

interface ChatErrorAlertProps {
  error: ErrorMessage | null
  onAction: (action: ErrorAction, id: string) => void
}

const ICON_MAP: Partial<Record<string, React.ElementType>> = {
  "Connection Lost": WifiOffIcon,
}

export function ChatErrorAlert({ error, onAction }: ChatErrorAlertProps) {
  const canRetry =
    error?.action?.type === "retry" &&
    !!(error.action as { prompt?: string }).prompt

  // Only auto-dismiss when there's no retry action (informational banners like "Retrying…")
  const shouldAutoDismiss = !!error && !canRetry && error.action?.type === "dismiss"

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onActionRef = useRef(onAction)
  useLayoutEffect(() => { onActionRef.current = onAction })

  useEffect(() => {
    if (!shouldAutoDismiss || !error) return
    const id = error.id
    timerRef.current = setTimeout(() => {
      onActionRef.current({ type: "dismiss" }, id)
    }, 4000)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [error?.id, shouldAutoDismiss])

  if (!error) return null

  const Icon = ICON_MAP[error.title] ?? AlertCircleIcon
  const canDismiss = !!error.action && error.action.type !== "continue"

  return (
    <div
      className={cn(
        "mx-auto w-full max-w-3xl px-6 pb-1",
        "animate-in slide-in-from-bottom-2 fade-in-0 duration-200"
      )}
    >
      <div className="flex items-center gap-2.5 rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2">
        <Icon className="h-3.5 w-3.5 shrink-0 text-destructive/70" />

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-medium text-foreground">{error.title}</span>
            {error.retryCount != null && (
              <span className="text-[10px] text-muted-foreground/60">
                attempt {error.retryCount}
              </span>
            )}
          </div>
          {error.message && (
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground/80 line-clamp-1">
              {error.message}
            </p>
          )}
        </div>

        {canRetry && (
          <Button
            size="xs"
            variant="destructive"
            onClick={() => onAction(error.action!, error.id)}
            className="shrink-0"
          >
            <RotateCwIcon className="h-3 w-3" />
            Retry
          </Button>
        )}

        {canDismiss && (
          <button
            type="button"
            onClick={() => onAction({ type: "dismiss" }, error.id)}
            className="shrink-0 rounded p-0.5 text-muted-foreground/40 transition-colors hover:text-muted-foreground"
          >
            <XIcon className="h-3.5 w-3.5" />
            <span className="sr-only">Dismiss</span>
          </button>
        )}
      </div>
    </div>
  )
}
