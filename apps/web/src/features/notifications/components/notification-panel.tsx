import {
  AlertOctagonIcon,
  BellOffIcon,
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react"
import { useEffect } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useShallow } from "zustand/react/shallow"

import { Button } from "@/shared/ui/button"
import { Progress } from "@/shared/ui/progress"
import {
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
} from "@/shared/ui/popover"
import { cn } from "@/shared/lib/utils"
import {
  useNotificationStore,
  selectNotificationList,
  type NotificationItem,
  type NotificationVariant,
} from "../store"

const VARIANT_ICON: Record<
  NotificationVariant,
  React.ComponentType<{ className?: string }> | null
> = {
  success: CircleCheckIcon,
  error: AlertOctagonIcon,
  warning: TriangleAlertIcon,
  info: InfoIcon,
  default: null,
}

const VARIANT_COLOR: Record<NotificationVariant, string> = {
  success: "text-emerald-500",
  error: "text-destructive",
  warning: "text-amber-500",
  info: "text-blue-500",
  default: "text-muted-foreground",
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms
  if (diff < 60_000) return "just now"
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function NotificationRow({ item }: { item: NotificationItem }) {
  const navigate = useNavigate()
  const dismiss = useNotificationStore((s) => s.dismiss)
  const markRead = useNotificationStore((s) => s.markRead)
  const progressPct =
    item.progress && item.progress.total > 0
      ? Math.round((item.progress.current / item.progress.total) * 100)
      : null
  const VariantIcon = item.variant ? VARIANT_ICON[item.variant] : null
  const actionLabel = item.action?.label ?? "Open"
  const handleAction = () => {
    if (!item.action) return
    markRead(item.id)
    if (item.action.type === "open-thread") {
      void navigate({
        to: "/workspace/$threadId",
        params: { threadId: item.action.threadId },
      })
      return
    }
    if (item.action.type === "open-workspace") {
      void navigate({ to: "/new", search: { ws: item.action.workspaceId } })
    }
  }

  return (
    <div
      className={cn(
        "group relative flex flex-col gap-1 rounded-md px-2.5 py-2 text-xs",
        !item.read && "bg-muted/50"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        {VariantIcon && (
          <VariantIcon
            className={cn(
              "mt-0.5 size-3.5 shrink-0",
              VARIANT_COLOR[item.variant!]
            )}
          />
        )}
        <span className="min-w-0 flex-1 leading-snug font-medium">
          {item.title}
        </span>
        <button
          type="button"
          onClick={() => dismiss(item.id)}
          className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/30 group-hover:opacity-100"
          aria-label="Dismiss notification"
        >
          <XIcon className="size-3" />
        </button>
      </div>
      {item.description && (
        <p className="text-muted-foreground/80 leading-snug">
          {item.description}
        </p>
      )}
      {item.progress && (
        <div className="flex items-center gap-2 pt-0.5">
          <Progress value={progressPct} className="h-1 flex-1" />
          <span className="shrink-0 text-[0.65rem] text-muted-foreground">
            {item.progress.phase}
          </span>
        </div>
      )}
      <span className="text-[0.65rem] text-muted-foreground/60">
        {relativeTime(item.createdAt)}
      </span>
      {item.action && (
        <div className="pt-0.5">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="h-5 px-1.5 text-[0.65rem]"
            onClick={handleAction}
          >
            {actionLabel}
          </Button>
        </div>
      )}
    </div>
  )
}

export function NotificationPanel() {
  const items = useNotificationStore(useShallow(selectNotificationList))
  const clear = useNotificationStore((s) => s.clear)
  const clearRead = useNotificationStore((s) => s.clearRead)
  const markAllRead = useNotificationStore((s) => s.markAllRead)
  const hasUnread = items.some((item) => !item.read)
  const hasRead = items.some((item) => item.read)

  useEffect(() => {
    if (!hasUnread) return
    const timer = window.setTimeout(markAllRead, 800)
    return () => window.clearTimeout(timer)
  }, [hasUnread, markAllRead])

  return (
    <div className="flex w-80 flex-col gap-1">
      <PopoverHeader className="flex-row items-center justify-between gap-2 px-1">
        <div>
          <PopoverTitle>Notifications</PopoverTitle>
          <PopoverDescription className="sr-only">
            History of background activity and messages from this app.
          </PopoverDescription>
        </div>
        {items.length > 0 && (
          <div className="flex items-center gap-1">
            {hasRead && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-[0.7rem] text-muted-foreground"
                onClick={clearRead}
              >
                Clear read
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-[0.7rem] text-muted-foreground"
              onClick={clear}
            >
              Clear all
            </Button>
          </div>
        )}
      </PopoverHeader>
      <div className="flex max-h-80 flex-col gap-0.5 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-2 py-8 text-center text-xs text-muted-foreground">
            <BellOffIcon className="size-4" />
            No notifications
          </div>
        ) : (
          items.map((item) => <NotificationRow key={item.id} item={item} />)
        )}
      </div>
    </div>
  )
}
