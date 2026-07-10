import { useState } from "react"
import {
  CheckIcon,
  ChevronRightIcon,
  InfinityIcon,
  SearchIcon,
} from "lucide-react"

import { cn } from "@/shared/lib/utils"
import { Badge } from "@/shared/ui/badge"
import { Input } from "@/shared/ui/input"
import type { ToolCatalogGroup } from "@/features/workspace/api"

/** Search boxes only help once the catalog outgrows a single glance. */
const SEARCH_THRESHOLD = 10

/**
 * Grouped tool allowlist editor, shared by the mode and agent editors. Each
 * catalog group (built-ins, app tools, GitHub/GitLab, one per MCP server) is a
 * collapsible island whose body is a grid of toggle chips, with a search box
 * filtering across every group at once. All groups operate on one flat
 * `selected` allowlist.
 *
 * Groups with a stable name prefix carry a `glob` (e.g. `mcp__github__*`);
 * their "All + future" toggle writes that single glob entry instead of the
 * individual names, so tools the server adds later are covered automatically.
 * Names in `selected` that belong to none of the given groups are preserved
 * untouched (e.g. builtins managed elsewhere by the agent editor's presets).
 */
export function ToolPicker({
  groups,
  selected,
  onChange,
}: {
  groups: ToolCatalogGroup[]
  selected: string[]
  onChange: (tools: string[]) => void
}) {
  const selectedSet = new Set(selected)
  const [query, setQuery] = useState("")
  // Groups with something already allowed start open; the rest stay folded
  // until clicked (or matched by a search). Groups appearing later fall back
  // to the same has-selection default via `?? hasSelection` below.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      groups.map((group) => [
        group.id,
        (group.glob !== null && selectedSet.has(group.glob)) ||
          group.tools.some((tool) => selectedSet.has(tool.name)),
      ])
    )
  )

  const normalized = query.trim().toLowerCase()
  const searching = normalized.length > 0

  const totalTools = groups.reduce((sum, group) => sum + group.tools.length, 0)
  const totalActive = groups.reduce((sum, group) => {
    const globActive = group.glob !== null && selectedSet.has(group.glob)
    return (
      sum +
      (globActive
        ? group.tools.length
        : group.tools.filter((tool) => selectedSet.has(tool.name)).length)
    )
  }, 0)

  // While searching, a group label match keeps the whole group; otherwise
  // only the matching tools are shown and empty groups drop out.
  const visibleGroups = groups
    .map((group) => {
      if (!searching || group.label.toLowerCase().includes(normalized)) {
        return { group, tools: group.tools }
      }
      return {
        group,
        tools: group.tools.filter(
          (tool) =>
            tool.label.toLowerCase().includes(normalized) ||
            tool.name.toLowerCase().includes(normalized) ||
            (tool.description ?? "").toLowerCase().includes(normalized)
        ),
      }
    })
    .filter(({ tools }) => !searching || tools.length > 0)

  return (
    <div className="flex flex-col gap-2">
      {totalTools > SEARCH_THRESHOLD && (
        <div className="flex items-center gap-2.5">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
            <Input
              value={query}
              placeholder="Filter tools…"
              className="h-7 pl-7 text-xs"
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <span className="shrink-0 font-mono text-3xs text-muted-foreground tabular-nums">
            {totalActive}/{totalTools} allowed
          </span>
        </div>
      )}

      {visibleGroups.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border/60 px-3 py-4 text-center text-2xs text-muted-foreground">
          No tools match “{query.trim()}”.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {visibleGroups.map(({ group, tools }) => {
            const globActive =
              group.glob !== null && selectedSet.has(group.glob)
            const activeCount = globActive
              ? group.tools.length
              : group.tools.filter((tool) => selectedSet.has(tool.name)).length
            const hasSelection = activeCount > 0
            const open = searching || (openGroups[group.id] ?? hasSelection)
            const connected = group.connected !== false
            const groupNames = new Set(group.tools.map((tool) => tool.name))

            const setGlob = (on: boolean) => {
              if (!group.glob) return
              if (on) {
                // The glob covers everything — drop the now-redundant names.
                onChange([
                  ...selected.filter(
                    (name) => name !== group.glob && !groupNames.has(name)
                  ),
                  group.glob,
                ])
              } else {
                // Expand back to today's names so nothing silently
                // disappears; individual tools can be deselected from there.
                onChange([
                  ...selected.filter((name) => name !== group.glob),
                  ...group.tools
                    .map((tool) => tool.name)
                    .filter((name) => !selectedSet.has(name)),
                ])
              }
            }

            const selectAll = () =>
              onChange([
                ...selected,
                ...group.tools
                  .map((tool) => tool.name)
                  .filter((name) => !selectedSet.has(name)),
              ])
            const clearGroup = () =>
              onChange(
                selected.filter(
                  (name) => name !== group.glob && !groupNames.has(name)
                )
              )

            return (
              <section
                key={group.id}
                className={cn(
                  "overflow-hidden rounded-lg border border-border/60 bg-background/40 transition-colors",
                  hasSelection && "border-primary/25 bg-primary/[0.02]"
                )}
              >
                <div className="flex items-center gap-1 pr-2">
                  <button
                    type="button"
                    aria-expanded={open}
                    className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                    onClick={() =>
                      setOpenGroups((prev) => ({
                        ...prev,
                        [group.id]: !(prev[group.id] ?? hasSelection),
                      }))
                    }
                  >
                    <ChevronRightIcon
                      className={cn(
                        "size-3.5 shrink-0 text-muted-foreground/50 transition-transform",
                        open && "rotate-90"
                      )}
                    />
                    <span
                      className={cn(
                        "truncate text-xs font-medium",
                        !hasSelection && "text-muted-foreground"
                      )}
                    >
                      {group.label}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 font-mono text-3xs tabular-nums",
                        hasSelection
                          ? "text-primary"
                          : "text-muted-foreground/60"
                      )}
                    >
                      {activeCount}/{group.tools.length}
                    </span>
                    {group.connected === false && (
                      <Badge
                        variant="outline"
                        className="h-4 shrink-0 px-1.5 text-3xs"
                      >
                        connecting
                      </Badge>
                    )}
                  </button>
                  {open && !globActive && group.tools.length > 0 && (
                    <span className="flex shrink-0 items-center">
                      {activeCount < group.tools.length && (
                        <button
                          type="button"
                          className="rounded px-1.5 py-0.5 text-3xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                          onClick={selectAll}
                        >
                          All
                        </button>
                      )}
                      {activeCount > 0 && (
                        <button
                          type="button"
                          className="rounded px-1.5 py-0.5 text-3xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                          onClick={clearGroup}
                        >
                          None
                        </button>
                      )}
                    </span>
                  )}
                  {group.glob !== null && (
                    <button
                      type="button"
                      aria-pressed={globActive}
                      title="Allow every tool from this source, including tools it adds later"
                      className={cn(
                        "inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-3xs font-medium transition-colors",
                        globActive
                          ? "border-primary/40 bg-primary/10 text-foreground"
                          : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground"
                      )}
                      onClick={() => setGlob(!globActive)}
                    >
                      <InfinityIcon className="size-3" />
                      All + future
                    </button>
                  )}
                </div>

                {open &&
                  (group.tools.length === 0 ? (
                    <div className="border-t border-border/50 px-3 py-2.5 text-2xs text-muted-foreground">
                      {connected
                        ? "This source is connected but exposes no tools."
                        : "Tools appear once the server connects."}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5 border-t border-border/50 px-2.5 py-2">
                      {globActive && (
                        <span className="text-3xs text-muted-foreground">
                          Every current and future tool from this source is
                          allowed.
                        </span>
                      )}
                      <div className="flex flex-wrap gap-1.5">
                        {tools.map((tool) => {
                          const active =
                            globActive || selectedSet.has(tool.name)
                          return (
                            <button
                              key={tool.name}
                              type="button"
                              title={tool.description || tool.name}
                              aria-pressed={active}
                              disabled={globActive}
                              className={cn(
                                "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-2xs transition-colors",
                                active
                                  ? "border-primary/40 bg-primary/10 text-foreground"
                                  : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground",
                                globActive && "opacity-70"
                              )}
                              onClick={() =>
                                onChange(
                                  selectedSet.has(tool.name)
                                    ? selected.filter(
                                        (name) => name !== tool.name
                                      )
                                    : [...selected, tool.name]
                                )
                              }
                            >
                              <CheckIcon
                                className={cn(
                                  "size-3",
                                  active ? "text-primary" : "opacity-0"
                                )}
                              />
                              {tool.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
