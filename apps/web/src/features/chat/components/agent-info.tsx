import { cn } from "@/shared/lib/utils"
import { Badge } from "@/shared/ui/badge"
import type { AgentDto } from "@/features/workspace/api"

/**
 * Shared presentational helpers for rendering an {@link AgentDto}'s facts —
 * model override, tool allowlist, source — so the composer's #-mention
 * dropdown (agent-mention-dropdown.tsx), the sent-message chip tooltip
 * (user-message.tsx), and the subagent run card (subagent-card.tsx) all speak
 * the same grammar instead of drifting into three slightly different agent
 * summaries.
 */

/**
 * Built-in tools that are genuinely read-only — the read/search/fetch family
 * from the server's tool catalog (apps/server/src/routes/tools.ts, kept in
 * sync with the pi-sdk builtin/host tool names in packages/pi-sdk/src/
 * agents.ts). Deliberately NOT here: `bash`/`edit`/`write` (mutate files),
 * `todo`/`plan`/`create_automation` (write app state), `delegate` (spawns
 * agents that may write), `memory` (writes the durable knowledge base), and
 * `question` (interactive, not a read).
 */
const READ_ONLY_BUILTIN_TOOLS: ReadonlySet<string> = new Set([
  "read",
  "grep",
  "find",
  "ls",
  "lsp",
  "semantic_search",
  "web_fetch",
])

/**
 * True when EVERY tool in an agent's allowlist is a known read-only builtin.
 * This is the "read-only" safety badge for delegation, so it errs strictly
 * conservative: any name outside {@link READ_ONLY_BUILTIN_TOOLS} — MCP tools
 * (`mcp__srv__*`), git-host tools (`github_*`), prefix globs, custom or
 * unknown names — disqualifies, because we can't prove it doesn't mutate.
 * False negatives (no badge on a truly read-only agent holding an unknown
 * tool) are acceptable; false positives are not. Empty allowlists are not
 * read-only — they're just unknown/unset, so this only fires with a
 * non-empty list.
 */
export function isReadOnlyAgent(tools: string[]): boolean {
  return (
    tools.length > 0 && tools.every((tool) => READ_ONLY_BUILTIN_TOOLS.has(tool))
  )
}

interface AgentModelParts {
  provider: string
  model: string
}

/** Split a `provider::model` composite into display parts, or null when the
 * agent has no override (it inherits the conversation's model). */
export function formatAgentModel(
  model: string | null | undefined
): AgentModelParts | null {
  if (!model) return null
  const idx = model.indexOf("::")
  if (idx === -1) return { provider: "", model }
  return { provider: model.slice(0, idx), model: model.slice(idx + 2) }
}

const SOURCE_LABEL: Record<AgentDto["source"], string> = {
  builtin: "Built-in",
  local: "Local",
  global: "Global",
}

/** Small badge naming where an agent definition came from. */
export function AgentSourceBadge({
  source,
  className,
}: {
  source: AgentDto["source"]
  className?: string
}) {
  return (
    <Badge
      variant="outline"
      className={cn("h-4 px-1.5 text-3xs font-normal", className)}
    >
      {SOURCE_LABEL[source]}
    </Badge>
  )
}

/** The model line shown wherever an agent's model override matters: the
 * provider (muted) + model name, or "Inherits conversation model" when the
 * agent has no override. */
export function AgentModelLine({
  model,
  className,
}: {
  model: string | null | undefined
  className?: string
}) {
  const parts = formatAgentModel(model)
  if (!parts) {
    return (
      <span
        className={cn("text-2xs text-muted-foreground italic", className)}
      >
        Inherits conversation model
      </span>
    )
  }
  return (
    <span className={cn("text-2xs", className)}>
      {parts.provider && (
        <span className="text-muted-foreground">{parts.provider} · </span>
      )}
      <span className="text-foreground/80">{parts.model}</span>
    </span>
  )
}

/** A small muted badge naming an agent's model override — renders nothing
 * when the agent inherits the conversation model, so it can be dropped
 * inline without a conditional at every call site. */
export function AgentModelBadge({
  model,
  className,
}: {
  model: string | null | undefined
  className?: string
}) {
  const parts = formatAgentModel(model)
  if (!parts) return null
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-4 shrink-0 px-1.5 font-mono text-3xs font-normal text-muted-foreground",
        className
      )}
    >
      {parts.provider && <span className="opacity-60">{parts.provider}/</span>}
      {parts.model}
    </Badge>
  )
}

const MAX_TOOL_PREVIEW = 8

/** Just the "N tools" count + a "read-only" badge when the heuristic fires —
 * compact enough for a tooltip line. */
export function AgentToolCountLine({
  tools,
  className,
}: {
  tools: string[]
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 text-2xs text-muted-foreground",
        className
      )}
    >
      <span>
        {tools.length} {tools.length === 1 ? "tool" : "tools"}
      </span>
      {isReadOnlyAgent(tools) && (
        <Badge
          variant="outline"
          className="h-4 px-1.5 text-3xs font-normal text-emerald-600 dark:text-emerald-400"
        >
          read-only
        </Badge>
      )}
    </div>
  )
}

/** The full tools summary: the count line above, plus up to `max` tool-name
 * badges with a "+N more" overflow badge. */
export function AgentToolsSummary({
  tools,
  max = MAX_TOOL_PREVIEW,
  className,
}: {
  tools: string[]
  max?: number
  className?: string
}) {
  const preview = tools.slice(0, max)
  const overflow = tools.length - preview.length
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <AgentToolCountLine tools={tools} />
      {preview.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {preview.map((tool) => (
            <Badge
              key={tool}
              variant="outline"
              className="h-4 px-1.5 font-mono text-3xs font-normal text-muted-foreground"
            >
              {tool}
            </Badge>
          ))}
          {overflow > 0 && (
            <Badge
              variant="outline"
              className="h-4 px-1.5 text-3xs font-normal text-muted-foreground"
            >
              +{overflow} more
            </Badge>
          )}
        </div>
      )}
    </div>
  )
}
