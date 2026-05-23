import { useCallback, useRef, useState } from "react"
import { useNavigate, useParams } from "@tanstack/react-router"
import { Loader2, MessageSquare, Plus, X } from "lucide-react"
import { Icon } from "@iconify/react"
import { getIconName } from "@/shared/ui/file-icon"
import { Button } from "@/shared/ui/button"
import { cn } from "@/shared/lib/utils"
import { useMainTabs, type MainTab } from "../store"
import { useWorkspace } from "@/features/workspace"
import { useThreadStatus } from "@/features/chat"

function ThreadTabIcon({ threadId }: { threadId: string }) {
  const status = useThreadStatus(threadId)
  if (status === "streaming") return <Loader2 className="size-3.5 shrink-0 animate-spin opacity-60" />
  if (status === "completed") return <span className="size-1.5 shrink-0 rounded-full bg-green-500" />
  if (status === "error") return <span className="size-1.5 shrink-0 rounded-full bg-red-500" />
  return <MessageSquare className="size-3.5 shrink-0 opacity-60" />
}

export function MainTabBar() {
  const { tabs, activeTabId, activeTab, closeTab, setActiveTab, reorderTabs, pendingThreadIds } = useMainTabs()
  const navigate = useNavigate()
  const { threadId: activeThreadId } = useParams({ strict: false }) as { threadId?: string }
  const { workspaces, deleteThread } = useWorkspace()
  const draggedTabId = useRef<string | null>(null)
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; before: boolean } | null>(null)

  const activeWorkspace =
    activeTab?.type === "file" && activeTab.workspacePath
      ? workspaces.find((ws) => ws.path === activeTab.workspacePath)
      : workspaces.find((ws) => ws.threads.some((t) => t.id === activeThreadId))

  const handleNewThread = useCallback(() => {
    navigate({ to: "/new", search: activeWorkspace ? { ws: activeWorkspace.id } : {} })
  }, [activeWorkspace, navigate])

  const handleTabClick = (tab: MainTab) => {
    setActiveTab(tab.id)
    if (tab.type === "thread") {
      navigate({
        to: "/workspace/$threadId",
        params: { threadId: tab.threadId },
      })
    }
  }

  const handleCloseTab = (e: React.MouseEvent, tab: MainTab) => {
    e.stopPropagation()

    const isActive = tab.id === activeTabId
    if (isActive) {
      const tabIdx = tabs.findIndex((t) => t.id === tab.id)
      const remaining = tabs.filter((t) => t.id !== tab.id)

      if (remaining.length === 0) {
        navigate({ to: "/" })
      } else {
        const next = remaining[Math.max(0, tabIdx - 1)]
        if (next.type === "thread") {
          navigate({
            to: "/workspace/$threadId",
            params: { threadId: next.threadId },
          })
        }
      }
    }

    if (tab.type === "thread" && pendingThreadIds.has(tab.threadId)) {
      const ws = workspaces.find((w) => w.threads.some((t) => t.id === tab.threadId))
      if (ws) {
        deleteThread(ws.id, tab.threadId).catch(() => {})
      }
    }

    closeTab(tab.id)
  }

  return (
    <>
      <div className="flex h-9 shrink-0 items-center border-b bg-background px-1 gap-0.5 overflow-x-auto scrollbar-none">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId
        const isDragging = draggingTabId === tab.id
        const dropBefore = dropTarget?.id === tab.id && dropTarget.before
        const dropAfter = dropTarget?.id === tab.id && !dropTarget.before
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            draggable
            onClick={() => handleTabClick(tab)}
            onDragStart={(e) => {
              draggedTabId.current = tab.id
              setDraggingTabId(tab.id)
              e.dataTransfer.effectAllowed = "move"
              e.dataTransfer.setData("text/plain", tab.id)
            }}
            onDragEnd={() => {
              draggedTabId.current = null
              setDraggingTabId(null)
              setDropTarget(null)
            }}
            onDragOver={(e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = "move"
              const rect = e.currentTarget.getBoundingClientRect()
              const before = e.clientX < rect.left + rect.width / 2
              setDropTarget({ id: tab.id, before })
            }}
            onDragLeave={() => setDropTarget(null)}
            onDrop={(e) => {
              e.preventDefault()
              const dragged = draggedTabId.current
              if (dragged && dragged !== tab.id) {
                const rect = e.currentTarget.getBoundingClientRect()
                const before = e.clientX < rect.left + rect.width / 2
                reorderTabs(dragged, tab.id, before)
              }
              draggedTabId.current = null
              setDropTarget(null)
            }}
            className={cn(
              "group relative flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-md pl-2.5 pr-1.5 text-xs select-none transition-all duration-150",
              isActive
                ? "bg-muted/30 text-foreground shadow-sm ring-1 ring-border/60"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground/70",
              isDragging && "opacity-40",
              dropBefore && "border-l-2 border-primary",
              dropAfter && "border-r-2 border-primary"
            )}
          >
            {tab.type === "thread" ? (
              <ThreadTabIcon threadId={tab.threadId} />
            ) : (
              <Icon
                icon={`catppuccin:${getIconName(tab.title)}`}
                className="size-3.5 shrink-0"
                aria-hidden
              />
            )}
            <span className="max-w-32 truncate">{tab.title}</span>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Close ${tab.title}`}
              onClick={(e) => handleCloseTab(e, tab)}
              className={cn(
                "ml-0.5 shrink-0",
                isActive
                  ? "opacity-60 hover:opacity-100"
                  : "opacity-0 group-hover:opacity-60 group-hover:hover:opacity-100"
              )}
            >
              <X className="h-2.5 w-2.5" />
            </Button>
          </div>
        )
      })}

      {workspaces.length > 0 && (
        <button
          onClick={handleNewThread}
          className="flex h-7 items-center rounded-md px-2 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          aria-label="New thread"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      )}
      </div>
    </>
  )
}
