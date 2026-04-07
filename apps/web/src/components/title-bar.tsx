import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { ChevronLeft, ChevronRight, TerminalSquare } from "lucide-react"
import { useRouter, useParams } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar"
import { useWorkspace } from "@/hooks/workspace-context"
import { useTerminal } from "@/hooks/terminal-context"
import { CommitDialog } from "@/components/commit-dialog"

const isMac =
  typeof window !== "undefined" && window.electronAPI?.platform === "darwin"

export function TitleBar() {
  const router = useRouter()
  const { open } = useSidebar()
  const { workspaces } = useWorkspace()
  const { isOpen: terminalOpen, toggle: toggleTerminal } = useTerminal()
  const { threadId } = useParams({ strict: false }) as { threadId?: string }
  const activeThread = threadId
    ? workspaces.flatMap((w) => w.threads).find((t) => t.id === threadId)
    : undefined
  const activeWorkspace = activeThread
    ? workspaces.find((w) => w.threads.some((t) => t.id === activeThread.id))
    : undefined

  const { subscribe, getSnapshot } = useMemo(() => {
    let count = 0
    return {
      subscribe: (notify: () => void) =>
        router.history.subscribe(({ action }) => {
          if (action.type === "PUSH" || action.type === "REPLACE") count = 0
          else if (action.type === "BACK") count++
          else if (action.type === "FORWARD") count = Math.max(0, count - 1)
          notify()
        }),
      getSnapshot: () => count > 0,
    }
  }, [router.history])

  const canGoBack = router.history.canGoBack()
  const canGoForward = useSyncExternalStore(subscribe, getSnapshot, () => false)

  const navRef = useRef<HTMLDivElement>(null)
  const [navWidth, setNavWidth] = useState(0)
  useEffect(() => {
    if (navRef.current) setNavWidth(navRef.current.offsetWidth)
  }, [])

  return (
    <div
      className="sticky top-0 z-20 flex h-12 shrink-0 items-center bg-transparent"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      {/* Nav controls — absolutely positioned so they never move */}
      <div
        ref={navRef}
        className={`absolute inset-y-0 left-0 flex items-center gap-1 ${isMac ? "pl-20" : "pl-2"}`}
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <SidebarTrigger />
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => router.history.back()}
          disabled={!canGoBack}
        >
          <ChevronLeft />
          <span className="sr-only">Go back</span>
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => router.history.forward()}
          disabled={!canGoForward}
        >
          <ChevronRight />
          <span className="sr-only">Go forward</span>
        </Button>
      </div>

      {/* Animated spacer — tracks sidebar width; never collapses past nav controls */}
      <div
        className="shrink-0 transition-[width] duration-200 ease-linear"
        style={{
          width: open ? "var(--sidebar-width)" : "0px",
          minWidth: navWidth,
        }}
      />

      {/* Thread title — left edge follows the sidebar */}
      {activeThread && (
        <div
          className="flex min-w-0 flex-1 items-center px-6"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <span className="truncate text-sm font-medium">
            {activeThread.title}
          </span>
        </div>
      )}

      {/* Right controls */}
      <div
        className="absolute inset-y-0 right-0 flex items-center gap-1 pr-3"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <CommitDialog cwd={activeWorkspace?.path} />
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={toggleTerminal}
          data-active={terminalOpen}
          className="data-[active=true]:bg-accent data-[active=true]:text-accent-foreground"
        >
          <TerminalSquare />
          <span className="sr-only">Toggle terminal</span>
        </Button>
      </div>
    </div>
  )
}
