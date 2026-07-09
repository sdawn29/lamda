import { CheckIcon, InfinityIcon } from "lucide-react"

import { cn } from "@/shared/lib/utils"
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
    <div className="flex flex-col gap-3">
      {groups.map((group) => {
        const globActive = group.glob !== null && selectedSet.has(group.glob)
        const activeCount = globActive
          ? group.tools.length
          : group.tools.filter((tool) => selectedSet.has(tool.name)).length

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
          <div key={group.id} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-3xs font-medium text-muted-foreground">
                {group.label}
                <span className="font-normal text-muted-foreground/60">
                  {activeCount}/{group.tools.length}
                </span>
                {group.connected === false && (
                  <span className="font-normal text-muted-foreground/60">
                    connecting…
                  </span>
                )}
              </span>
              {group.glob !== null && (
                <button
                  type="button"
                  aria-pressed={globActive}
                  title="Allow every tool from this source, including tools it adds later"
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-3xs font-medium transition-colors",
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
            {group.tools.length === 0 ? (
              <span className="text-2xs text-muted-foreground">
                {group.connected === false
                  ? "Tools appear once the server connects."
                  : "No tools."}
              </span>
            ) : (
              <div className="flex flex-wrap gap-1.5">
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
                        "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-left font-mono text-2xs transition-colors",
                        active
                          ? "border-primary/40 bg-primary/10 text-foreground"
                          : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground",
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
                      <CheckIcon
                        className={cn(
                          "size-3",
                          active ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {tool.label}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
