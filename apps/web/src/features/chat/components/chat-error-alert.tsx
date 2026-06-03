import { useEffect, useLayoutEffect, useRef, useState } from "react"
import {
  AlertCircleIcon,
  CheckIcon,
  ChevronRightIcon,
  CopyIcon,
  RotateCwIcon,
  WifiOffIcon,
  XIcon,
} from "lucide-react"
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

  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Collapse + reset copy state whenever a new error takes the slot.
  useEffect(() => {
    setExpanded(false)
    setCopied(false)
  }, [error?.id])

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

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
    }
  }, [])

  if (!error) return null

  const Icon = ICON_MAP[error.title] ?? AlertCircleIcon
  const canDismiss = !!error.action && error.action.type !== "continue"

  // Long / multi-line errors get an expand affordance so the full text is
  // reachable instead of being clamped to a single line.
  const isExpandable =
    !!error.message && (error.message.length > 80 || error.message.includes("\n"))

  function toggle() {
    if (!isExpandable) return
    setExpanded((prev) => !prev)
  }

  function handleCopy(e: React.MouseEvent) {
    e.stopPropagation()
    if (!error?.message) return
    void navigator.clipboard.writeText(error.message)
    setCopied(true)
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
    copyTimerRef.current = setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div
      className={cn(
        "mx-auto w-full max-w-3xl px-6 pb-1",
        "animate-in slide-in-from-bottom-2 fade-in-0 duration-200"
      )}
    >
      <div className="overflow-hidden rounded-xl border border-destructive/20 bg-destructive/5">
        {/* Header row */}
        <div className="flex items-center gap-2.5 px-3 py-2">
          <Icon className="h-3.5 w-3.5 shrink-0 text-destructive/70" />

          <button
            type="button"
            onClick={toggle}
            aria-expanded={isExpandable ? expanded : undefined}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-2 text-left",
              !isExpandable && "cursor-default"
            )}
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex items-baseline gap-2">
                <span className="text-xs font-medium text-foreground">{error.title}</span>
                {error.retryCount != null && (
                  <span className="text-[10px] text-muted-foreground/60">
                    attempt {error.retryCount}
                  </span>
                )}
              </span>
              {error.message && !expanded && (
                <span className="text-[11px] leading-relaxed text-muted-foreground/80 line-clamp-1">
                  {error.message}
                </span>
              )}
            </span>

            {isExpandable && (
              <ChevronRightIcon
                className={cn(
                  "h-3 w-3 shrink-0 text-muted-foreground/40 transition-transform duration-200",
                  expanded && "rotate-90"
                )}
              />
            )}
          </button>

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

        {/* Expandable body — full error text, scrollable + copyable */}
        <div
          className={cn(
            "grid transition-all duration-300 ease-in-out",
            expanded && isExpandable ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          )}
        >
          <div className="overflow-hidden">
            <div className="group/copy relative border-t border-destructive/15 bg-destructive/[0.04]">
              <pre className="max-h-64 overflow-auto px-3 py-2 pr-9 text-[11px] leading-relaxed break-all whitespace-pre-wrap text-foreground/80">
                {error.message}
              </pre>
              <button
                type="button"
                onClick={handleCopy}
                className={cn(
                  "absolute top-1.5 right-1.5 shrink-0 rounded p-1 text-muted-foreground/40 opacity-0 transition-colors group-hover/copy:opacity-100 hover:bg-destructive/10 hover:text-muted-foreground",
                  copied && "text-emerald-500 opacity-100"
                )}
                aria-label="Copy error"
              >
                {copied ? (
                  <CheckIcon className="h-3 w-3" />
                ) : (
                  <CopyIcon className="h-3 w-3" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
