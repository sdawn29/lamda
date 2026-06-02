import type React from "react"
import { useMemo, useRef, useState } from "react"
import { ArrowLeft, Search, X } from "lucide-react"
import { Link, useMatchRoute, useRouter } from "@tanstack/react-router"

import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { ShortcutKbd } from "@/shared/ui/kbd"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip"
import { useShortcutBinding } from "@/shared/components/keyboard-shortcuts-provider"
import { SHORTCUT_ACTIONS } from "@/shared/lib/keyboard-shortcuts"
import { APP_SETTINGS_KEYS } from "@/shared/lib/storage-keys"
import { useWorkspace } from "@/features/workspace"
import { cn } from "@/shared/lib/utils"
import { useAppSettings } from "../queries"
import {
  matchesSearch,
  SETTINGS_GROUPS,
  SETTINGS_SECTIONS,
  type SettingsSectionMeta,
} from "../sections"

function SidebarLink({ section }: { section: SettingsSectionMeta }) {
  const Icon = section.icon
  const matchRoute = useMatchRoute()
  const isActive = !!matchRoute({
    to: "/settings/$section",
    params: { section: section.slug },
  })

  return (
    <Link
      to="/settings/$section"
      params={{ section: section.slug }}
      preload="intent"
      className={cn(
        "group relative flex h-8 w-full items-center gap-2 rounded-md px-2 text-[13px] transition-colors",
        isActive
          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
          : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
      )}
    >
      <Icon
        className={cn(
          "h-3.5 w-3.5 shrink-0 transition-colors",
          isActive ? "text-foreground" : "text-muted-foreground/80"
        )}
      />
      <span className="truncate">{section.label}</span>
    </Link>
  )
}

function BackToThreadsButton() {
  const router = useRouter()
  const closeBinding = useShortcutBinding(SHORTCUT_ACTIONS.OPEN_SETTINGS)
  const { workspaces } = useWorkspace()
  const { data: settings } = useAppSettings()

  // Snapshot the thread that was active when settings was opened. Captured on
  // first render and frozen so navigating between sections doesn't change it.
  const initialThreadIdRef = useRef<string | null>(null)
  if (initialThreadIdRef.current === null) {
    const saved = settings?.[APP_SETTINGS_KEYS.ACTIVE_THREAD_ID]
    if (typeof saved === "string" && saved) {
      initialThreadIdRef.current = saved
    }
  }

  const handleClose = () => {
    const threadId = initialThreadIdRef.current
    const allThreads = workspaces.flatMap((w) => w.threads)
    const exists = threadId && allThreads.some((t) => t.id === threadId)
    if (exists && threadId) {
      router.navigate({
        to: "/workspace/$threadId",
        params: { threadId },
      })
    } else {
      router.navigate({ to: "/" })
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClose}
            aria-label="Back to threads"
            className="h-7 w-full justify-start gap-1.5 px-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            <span className="text-xs font-medium">Threads</span>
          </Button>
        }
      />
      <TooltipContent side="right">
        Back to threads
        {closeBinding && (
          <ShortcutKbd binding={closeBinding} className="ml-1" />
        )}
      </TooltipContent>
    </Tooltip>
  )
}

export function SettingsSidebar() {
  const [search, setSearch] = useState("")

  const filtered = useMemo(
    () =>
      search.trim()
        ? SETTINGS_SECTIONS.filter((s) => matchesSearch(s, search))
        : SETTINGS_SECTIONS,
    [search]
  )

  const visibleByGroup = useMemo(() => {
    const map = new Map<string, SettingsSectionMeta[]>()
    for (const section of filtered) {
      const list = map.get(section.group) ?? []
      list.push(section)
      map.set(section.group, list)
    }
    return map
  }, [filtered])

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      {/* Top drag region — reserves space for macOS traffic lights */}
      <div
        className="h-11 shrink-0"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      />

      {/* Back to threads */}
      <div className="px-2 pb-2">
        <BackToThreadsButton />
      </div>

      {/* Search */}
      <div className="px-3 pb-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/70" />
          <Input
            placeholder="Search settings…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 bg-sidebar-accent/40 pr-7 pl-7 text-xs shadow-none"
          />
          {search && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setSearch("")}
              className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X />
              <span className="sr-only">Clear search</span>
            </Button>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {filtered.length === 0 ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            No settings match.
          </p>
        ) : search.trim() ? (
          <div className="flex flex-col gap-0.5 pt-1">
            {filtered.map((section) => (
              <SidebarLink key={section.slug} section={section} />
            ))}
          </div>
        ) : (
          SETTINGS_GROUPS.map((group) => {
            const items = visibleByGroup.get(group.id)
            if (!items?.length) return null
            return (
              <div key={group.id} className="mt-3 first:mt-1">
                <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/55">
                  {group.label}
                </p>
                <div className="flex flex-col gap-0.5">
                  {items.map((section) => (
                    <SidebarLink key={section.slug} section={section} />
                  ))}
                </div>
              </div>
            )
          })
        )}
      </nav>

      {/* Footer */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-sidebar-border px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <span
            className="text-base leading-none font-black"
            style={{ color: "#d4a017" }}
          >
            Λ
          </span>
          <span className="text-[11px] font-medium text-muted-foreground">
            Lamda
          </span>
        </div>
        {import.meta.env.DEV ? (
          <Badge variant="outline" className="font-mono text-[10px]">
            dev
          </Badge>
        ) : (
          <Badge variant="outline" className="font-mono text-[10px]">
            v{__APP_VERSION__}
          </Badge>
        )}
      </div>
    </aside>
  )
}
