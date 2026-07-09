import { BellIcon } from "lucide-react"

import { Button } from "@/shared/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/shared/ui/tooltip"
import { useNotificationStore, selectUnreadCount } from "../store"
import { NotificationPanel } from "./notification-panel"

/**
 * Persistent notification surface (as opposed to the transient sonner toasts
 * in `use-thread-notifications.ts`) — currently fed by background code
 * indexing progress, built generic so other event kinds can register here
 * later (see `NotificationKind`).
 */
export function NotificationBell() {
  const unreadCount = useNotificationStore(selectUnreadCount)
  const markAllRead = useNotificationStore((s) => s.markAllRead)

  return (
    <Popover onOpenChange={(open) => open && markAllRead()}>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative size-7 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  aria-label="Notifications"
                >
                  <BellIcon className="size-4" />
                  {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 flex size-1.5 rounded-full bg-primary" />
                  )}
                </Button>
              }
            />
          }
        />
        <TooltipContent>Notifications</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-auto p-2">
        <NotificationPanel />
      </PopoverContent>
    </Popover>
  )
}
