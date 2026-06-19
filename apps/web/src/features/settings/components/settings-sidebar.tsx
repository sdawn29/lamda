import { useMemo, useState } from "react"
import { Search, X } from "lucide-react"
import { Link, useMatchRoute } from "@tanstack/react-router"

import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import { SectionLabel } from "@/shared/ui/section-label"
import { Input } from "@/shared/ui/input"
import { cn } from "@/shared/lib/utils"
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
        "group relative flex h-8 w-full items-center gap-2 rounded-md px-2 text-sm transition-colors",
        isActive
          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
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
    <aside className="flex h-full w-60 shrink-0 flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-md">
      {/* Search */}
      <div className="px-3 pt-3 pb-3">
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
                <SectionLabel className="mb-1 block px-2">
                  {group.label}
                </SectionLabel>
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
      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <span
            className="text-base leading-none font-black"
            style={{ color: "#d4a017" }}
          >
            Λ
          </span>
          <span className="text-2xs font-medium text-muted-foreground">
            Lamda
          </span>
        </div>
        {import.meta.env.DEV ? (
          <Badge variant="outline" className="font-mono text-3xs">
            dev
          </Badge>
        ) : (
          <Badge variant="outline" className="font-mono text-3xs">
            v{__APP_VERSION__}
          </Badge>
        )}
      </div>
    </aside>
  )
}
