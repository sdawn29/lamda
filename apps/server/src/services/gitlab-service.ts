import { homedir } from "node:os";
import { existsSync } from "node:fs";
import * as gl from "@lamda/gitlab";
import { getWorkspace, listWorkspacesWithThreads } from "@lamda/db";
import { store } from "../store.js";

export { gl };

export function sessionCwd(sessionId: string): string | null {
  return store.getCwd(sessionId) ?? null;
}

export function workspaceCwd(workspaceId: string): string | null {
  return getWorkspace(workspaceId)?.path ?? null;
}

export function anyRepoCwd(): string {
  for (const ws of listWorkspacesWithThreads()) {
    if (ws.path && existsSync(ws.path)) return ws.path;
  }
  return homedir();
}
