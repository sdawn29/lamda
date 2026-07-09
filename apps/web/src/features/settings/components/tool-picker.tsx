import {
  CheckIcon,
  CircleIcon,
  InfinityIcon,
  PlugZapIcon,
  WrenchIcon,
} from "lucide-react"

import { cn } from "@/shared/lib/utils"
import { Badge } from "@/shared/ui/badge"
import type { ToolCatalogGroup } from "@/features/workspace/api"

/**
 * Grouped tool allowlist editor, shared by the mode and agent editors. Renders
 * the catalog groups (built-ins, app tools, GitHub/GitLab, one per MCP server)
 * as toggleable chips operating on one flat `selected` allowlist.
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

  return (
    <div className="flex flex-col gap-2.5">
      {groups.map((group) => {
        const globActive = group.glob !== null && selectedSet.has(group.glob)
        const activeCount = globActive
          ? group.tools.length
          : group.tools.filter((tool) => selectedSet.has(tool.name)).length
        const hasTools = group.tools.length > 0
        const connected = group.connected !== false

        const setGlob = (on: boolean) => {
          if (!group.glob) return
          const groupNames = new Set(group.tools.map((tool) => tool.name))
          if (on) {
            // The glob covers everything — drop the now-redundant names.
            onChange([
              ...selected.filter(
                (name) => name !== group.glob && !groupNames.has(name)
              ),
              group.glob,
            ])
          } else {
            // Expand back to today's names so nothing silently disappears;
            // the user can deselect individual tools from there.
            onChange([
              ...selected.filter((name) => name !== group.glob),
              ...group.tools
                .map((tool) => tool.name)
                .filter((name) => !selectedSet.has(name)),
            ])
          }
        }

        return (
          <section
            key={group.id}
            className={cn(
              "overflow-hidden rounded-xl border border-border/70 bg-background/55 shadow-sm",
              activeCount > 0 && "border-primary/25 bg-primary/[0.025]"
            )}
          >
            <div className="flex items-start justify-between gap-3 border-b border-border/50 px-3 py-2.5">
              <div className="flex min-w-0 items-start gap-2.5">
                <span
                  className={cn(
                    "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-card text-muted-foreground",
                    activeCount > 0 && "border-primary/30 text-primary"
                  )}
                >
                  <PlugZapIcon className="size-3.5" />
                </span>
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <h4 className="truncate text-xs font-medium">
                      {group.label}
                    </h4>
                    <Badge
                      variant={activeCount > 0 ? "secondary" : "outline"}
                      className="h-4 px-1.5 text-3xs"
                    >
                      {activeCount}/{group.tools.length}
                    </Badge>
                    {group.connected === false && (
                      <Badge variant="outline" className="h-4 px-1.5 text-3xs">
                        connecting
                      </Badge>
                    )}
                  </div>
                  <span className="text-3xs text-muted-foreground/70">
                    {globActive
                      ? "Every current and future tool from this source is allowed."
                      : hasTools
                        ? "Choose individual tools from this source."
                        : connected
                          ? "This source is connected but exposes no tools."
                          : "Tools will appear here once this source connects."}
                  </span>
                </div>
              </div>
              {group.glob !== null && (
                <button
                  type="button"
                  aria-pressed={globActive}
                  title="Allow every tool from this source, including tools it adds later"
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-3xs font-medium transition-colors",
                    globActive
                      ? "border-primary/40 bg-primary/10 text-foreground"
                      : "border-border/60 bg-background text-muted-foreground hover:border-border hover:text-foreground"
                  )}
                  onClick={() => setGlob(!globActive)}
                >
                  <InfinityIcon className="size-3" />
                  All + future
                </button>
              )}
            </div>
            {group.tools.length === 0 ? (
              <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
                <CircleIcon className="size-3 fill-current opacity-40" />
                <span>
                  {group.connected === false
                    ? "Tools appear once the server connects."
                    : "No tools available from this source."}
                </span>
              </div>
            ) : (
              <div className="flex flex-col divide-y divide-border/45">
                {group.tools.map((tool) => {
                  const active = globActive || selectedSet.has(tool.name)
                  return (
                    <button
                      key={tool.name}
                      type="button"
                      title={tool.description}
                      aria-pressed={active}
                      disabled={globActive}
                      className={cn(
                        "group flex w-full items-start gap-2 px-3 py-2 text-left transition-colors",
                        active
                          ? "bg-primary/[0.045] text-foreground"
                          : "text-muted-foreground hover:bg-accent/45 hover:text-foreground",
                        globActive && "opacity-70"
                      )}
                      onClick={() =>
                        onChange(
                          selectedSet.has(tool.name)
                            ? selected.filter((name) => name !== tool.name)
                            : [...selected, tool.name]
                        )
                      }
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-md border transition-colors",
                          active
                            ? "border-primary/45 bg-primary/10 text-primary"
                            : "border-border/70 text-transparent group-hover:border-border"
                        )}
                      >
                        <CheckIcon className="size-3" />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                          <span className="truncate font-mono text-2xs">
                            {tool.label}
                          </span>
                          {globActive && (
                            <span className="text-3xs text-muted-foreground/60">
                              included
                            </span>
                          )}
                        </span>
                        {tool.description && (
                          <span className="line-clamp-2 text-3xs leading-relaxed text-muted-foreground">
                            {tool.description}
                          </span>
                        )}
                      </span>
                      <WrenchIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/35 transition-colors group-hover:text-muted-foreground/70" />
                    </button>
                  )
                })}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
