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

  const customTools = workspaceId ? await import("./mcp-service.js").then(m => m.getMcpToolsForSession(workspaceId)) : undefined
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