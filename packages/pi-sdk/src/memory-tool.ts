import type { ToolDefinition } from "@earendil-works/pi-coding-agent"
import {
  insertMemory,
  getMemory,
  listMemories,
  searchMemories,
  updateMemory,
  deleteMemory,
  touchMemoryUse,
  type MemoryRow,
  type MemoryScope,
} from "@lamda/db"

// ── Constants ─────────────────────────────────────────────────────────────────

export const MEMORY_TOOL_NAME = "memory"

// ── Public types ──────────────────────────────────────────────────────────────

export type { MemoryScope }

export interface MemoryItem {
  id: string
  scope: MemoryScope
  title: string
  content: string
  category: string | null
  pinned: boolean
}

export interface MemoryToolResult {
  operation: string
  memories: MemoryItem[]
  message?: string
}

// ── Serialization ─────────────────────────────────────────────────────────────

function toItem(row: MemoryRow): MemoryItem {
  return {
    id: row.id,
    scope: row.scope,
    title: row.title,
    content: row.content,
    category: row.category,
    pinned: row.pinned,
  }
}

function ok(
  operation: string,
  memories: MemoryRow[],
  message?: string,
): { content: { type: "text"; text: string }[]; details: Record<string, unknown> } {
  const items = memories.map(toItem)
  const payload: MemoryToolResult = { operation, memories: items, ...(message ? { message } : {}) }
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    details: { memories: items },
  }
}

function err(message: string): {
  content: { type: "text"; text: string }[]
  details: Record<string, unknown>
} {
  return {
    content: [{ type: "text", text: JSON.stringify({ error: message }) }],
    details: {},
  }
}

// ── Tool factory ──────────────────────────────────────────────────────────────

/**
 * Create the memory tool bound to a workspace. Memories persist in the DB across
 * threads and sessions: `workspace` scope is visible to every thread in this
 * workspace, `user` scope to every workspace.
 *
 * When `workspaceId` is undefined (workspace-less session) only `user`-scoped
 * memories can be saved.
 */
export function createMemoryTool(workspaceId?: string): ToolDefinition {
  return {
    name: MEMORY_TOOL_NAME,
    label: "memory",
    description: `Persist durable facts you learn so future sessions start with them. At the top of a request you are shown a <lamda-memories> block holding pinned facts plus the memories most relevant to what was asked — not the whole store. When you suspect a relevant fact exists that wasn't surfaced, use \`search\` to retrieve it before asking the user.

Operations:
- save    — Store a new memory. Required: \`title\` (short), \`content\` (one concrete fact).
            Optional: \`scope\` ("workspace" = this project, default; "user" = applies to every project),
            \`category\` (free-form label, e.g. "convention", "environment"),
            \`pinned\` (true = always-on core context shown every session — reserve for a few high-value, broadly-relevant facts).
- list    — Show stored memories. Optional: \`scope\` filter.
- search  — Retrieve the memories most relevant to \`query\` (ranked full-text search). Use this to pull in facts not already surfaced.
- update  — Change a memory. Required: \`id\`. Optional: \`title\`, \`content\`, \`category\`, \`pinned\`.
- delete  — Remove a memory by \`id\` (use when you learn it is wrong or obsolete).

When to save — sparingly, only durable facts that will matter in future sessions:
- Project conventions not written down anywhere (build quirks, naming rules, preferred libraries).
- Corrections the user gives you ("we use pnpm, not npm") — save these immediately.
- Environment quirks discovered the hard way (flaky commands, required env vars, port conflicts).
- Use "user" scope only for the user's cross-project preferences (style, tone, workflow).

Never save: secrets, credentials, API keys, tokens, or anything derivable by reading the repo. One fact per memory. Update or delete outdated memories instead of stacking duplicates.`,

    parameters: {
      type: "object",
      required: ["operation"],
      properties: {
        operation: {
          type: "string",
          enum: ["save", "list", "search", "update", "delete"],
          description: "The memory operation to perform.",
        },
        title: {
          type: "string",
          description: "Short label for the memory (for 'save' and 'update').",
        },
        content: {
          type: "string",
          description: "The fact to remember (for 'save' and 'update').",
        },
        scope: {
          type: "string",
          enum: ["workspace", "user"],
          description:
            "'workspace' = this project only (default); 'user' = every project (for 'save' and 'list').",
        },
        category: {
          type: "string",
          description: "Optional free-form category label (for 'save' and 'update').",
        },
        pinned: {
          type: "boolean",
          description:
            "Pin as always-on core context shown every session (for 'save' and 'update'). Use sparingly.",
        },
        query: {
          type: "string",
          description: "Text to search for in titles and content (for 'search').",
        },
        id: {
          type: "string",
          description: "Memory ID to update or delete.",
        },
      },
    },

    execute: async (_toolCallId, params, _signal, _onUpdate) => {
      const p = (params && typeof params === "object" ? params : {}) as Record<string, unknown>
      const operation = typeof p.operation === "string" ? p.operation : undefined
      if (!operation) return err("Missing required parameter: operation")

      try {
        switch (operation) {
          // ── save ────────────────────────────────────────────────────────────
          case "save": {
            const title = typeof p.title === "string" ? p.title.trim() : ""
            const content = typeof p.content === "string" ? p.content.trim() : ""
            if (!title || !content) {
              return err("'save' requires non-empty 'title' and 'content' strings.")
            }
            const scope: MemoryScope = p.scope === "user" ? "user" : "workspace"
            if (scope === "workspace" && !workspaceId) {
              return err(
                "This session has no workspace — use scope 'user' for cross-project memories.",
              )
            }
            const category =
              typeof p.category === "string" && p.category.trim() ? p.category.trim() : null
            const id = insertMemory({
              scope,
              workspaceId: scope === "workspace" ? workspaceId : null,
              title,
              content,
              category,
              pinned: p.pinned === true,
              source: "agent",
            })
            const row = getMemory(id)
            return ok("save", row ? [row] : [], `Memory saved (scope: ${scope}).`)
          }

          // ── list ────────────────────────────────────────────────────────────
          case "list": {
            const scope =
              p.scope === "user" || p.scope === "workspace" ? (p.scope as MemoryScope) : undefined
            const rows = listMemories(
              scope === "workspace"
                ? { scope, workspaceId }
                : scope === "user"
                  ? { scope }
                  : undefined,
            ).filter((m) => m.scope === "user" || m.workspaceId === workspaceId)
            touchMemoryUse(rows.map((m) => m.id))
            return ok("list", rows)
          }

          // ── search ──────────────────────────────────────────────────────────
          case "search": {
            const query = typeof p.query === "string" ? p.query.trim() : ""
            if (!query) return err("'search' requires a non-empty 'query' string.")
            const rows = searchMemories(query, workspaceId)
            touchMemoryUse(rows.map((m) => m.id))
            return ok("search", rows, rows.length === 0 ? "No matching memories." : undefined)
          }

          // ── update ──────────────────────────────────────────────────────────
          case "update": {
            const id = typeof p.id === "string" ? p.id.trim() : ""
            if (!id) return err("'update' requires an 'id'.")
            const existing = getMemory(id)
            if (!existing) return err(`No memory with id "${id}".`)

            const updates: {
              title?: string
              content?: string
              category?: string | null
              pinned?: boolean
            } = {}
            if (typeof p.title === "string" && p.title.trim()) updates.title = p.title.trim()
            if (typeof p.content === "string" && p.content.trim())
              updates.content = p.content.trim()
            if (typeof p.category === "string") updates.category = p.category.trim() || null
            if (typeof p.pinned === "boolean") updates.pinned = p.pinned
            if (Object.keys(updates).length === 0) {
              return err(
                "'update' requires at least one of 'title', 'content', 'category', or 'pinned'.",
              )
            }

            updateMemory(id, updates)
            const row = getMemory(id)
            return ok("update", row ? [row] : [], "Memory updated.")
          }

          // ── delete ──────────────────────────────────────────────────────────
          case "delete": {
            const id = typeof p.id === "string" ? p.id.trim() : ""
            if (!id) return err("'delete' requires an 'id'.")
            const existing = getMemory(id)
            if (!existing) return err(`No memory with id "${id}".`)
            deleteMemory(id)
            return ok("delete", [], "Memory deleted.")
          }

          default:
            return err(`Unknown operation "${operation}". Use: save, list, search, update, delete.`)
        }
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e))
      }
    },
  }
}
