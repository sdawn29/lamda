import { createManagedSession, type SdkConfig } from "@lamda/pi-sdk"
import { updateThreadSessionFile, getWorkspace } from "@lamda/db"
import { store } from "../store.js"
import { sessionEvents } from "../session-events.js"

export async function createSessionForThread(
  threadId: string,
  cwd: string,
  workspaceId?: string,
  opts: Omit<Partial<SdkConfig>, "cwd"> = {},
): Promise<string> {
  // Inject workspace-scoped env vars into process.env so they are inherited
  // by any child processes (e.g. bash tool) that Claude spawns during the session.
  if (workspaceId) {
    const ws = getWorkspace(workspaceId)
    if (ws?.env) {
      try {
        const envVars = JSON.parse(ws.env) as Record<string, string>
        for (const [key, value] of Object.entries(envVars)) {
          if (key && value !== undefined) process.env[key] = String(value)
        }
      } catch { /* ignore malformed JSON */ }
    }
  }

  const customTools = workspaceId ? await collectCustomTools(workspaceId, cwd) : undefined
  const handle = await createManagedSession({ cwd, customTools, ...opts })
  const sessionId = store.create(handle, cwd, threadId, workspaceId)
  
  if (handle.sessionFile) {
    updateThreadSessionFile(threadId, handle.sessionFile)
  }
  
  // Start the event hub immediately so we capture tool_execution_start events
  const entry = store.get(sessionId)
  if (entry) {
    sessionEvents.ensure(sessionId, entry.threadId, entry.handle, entry.cwd)
  }

  return sessionId
}

export function ensureSessionEventHub(sessionId: string, entry: NonNullable<ReturnType<typeof store.get>>) {
  return sessionEvents.ensure(sessionId, entry.threadId, entry.handle, entry.cwd)
}

export function gitCwd(id: string): string | null {
  return store.getCwd(id) ?? null
}

/**
 * Merge MCP- and LSP-derived tools for a workspace. Both are loaded in
 * parallel; failures in either don't block the other.
 */
export async function collectCustomTools(workspaceId: string, workspacePath: string) {
  const [mcpTools, lspTools] = await Promise.all([
    import("./mcp-service.js").then((m) => m.getMcpToolsForSession(workspaceId)).catch((err) => {
      console.warn("[session-service] failed to load MCP tools:", err)
      return []
    }),
    import("./language-service.js").then((m) => m.getLspToolsForSession(workspaceId, workspacePath)).catch((err) => {
      console.warn("[session-service] failed to load LSP tools:", err)
      return []
    }),
  ])
  return [...mcpTools, ...lspTools]
}