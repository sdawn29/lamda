/**
 * Language Service — per-workspace pool of LSP child processes.
 *
 * Mirrors mcp-service.ts. One server per (workspaceId, language); spawned
 * lazily on first openDocument for that language. Pool is swept after the
 * workspace goes idle and explicitly shut down via shutdownWorkspace().
 */

import { promises as fs } from "node:fs";
import { isAbsolute, join } from "node:path";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import {
  LspClient,
  filePathToUri,
  uriToFilePath,
  getLanguageConfigForFilePath,
  resolveExecutable,
  buildLspTools,
} from "@lamda/lsp";
import type { LspToolHelpers } from "@lamda/lsp";
import { getWorkspace } from "@lamda/db";
import type {
  Diagnostic,
  PublishDiagnosticsParams,
} from "vscode-languageserver-protocol";

interface LspEntry {
  client: LspClient;
  /** LSP languageId, e.g. "typescript". */
  languageId: string;
  /** Files this entry has been asked to open (by absolute path). */
  openFiles: Set<string>;
}

/** workspaceId → languageId → entry */
const pool = new Map<string, Map<string, LspEntry>>();

/** workspaceId → subscribers receiving every diagnostics update. */
type DiagnosticsCallback = (params: PublishDiagnosticsParams) => void;
const diagnosticsSubscribers = new Map<string, Set<DiagnosticsCallback>>();

// Idle sweep every 15 minutes, matching mcp-service.
setInterval(() => {
  for (const workspaceId of Array.from(pool.keys())) {
    if (diagnosticsSubscribers.get(workspaceId)?.size) continue;
    const entries = pool.get(workspaceId);
    if (!entries) continue;
    let anyOpen = false;
    for (const e of entries.values()) {
      if (e.openFiles.size > 0) {
        anyOpen = true;
        break;
      }
    }
    if (!anyOpen) {
      void shutdownWorkspace(workspaceId).catch((err) =>
        console.warn(`[lsp] idle-sweep shutdown failed for ${workspaceId}:`, err),
      );
    }
  }
}, 15 * 60 * 1000).unref();

function getWorkspacePath(workspaceId: string): string | null {
  const ws = getWorkspace(workspaceId);
  return ws?.path ?? null;
}

function resolveAbsolutePath(workspaceRoot: string, filePath: string): string {
  return isAbsolute(filePath) ? filePath : join(workspaceRoot, filePath);
}

function emitDiagnostics(workspaceId: string, params: PublishDiagnosticsParams) {
  const subs = diagnosticsSubscribers.get(workspaceId);
  if (!subs) return;
  for (const cb of subs) {
    try {
      cb(params);
    } catch (err) {
      console.error("[lsp] subscriber error:", err);
    }
  }
}

/**
 * Spawn (if needed) a language server for a file's language.
 * Returns null when no server is registered or installed for the language.
 */
async function ensureServer(
  workspaceId: string,
  workspacePath: string,
  filePath: string,
): Promise<LspEntry | null> {
  const config = getLanguageConfigForFilePath(filePath);
  if (!config) return null;

  let workspacePool = pool.get(workspaceId);
  if (!workspacePool) {
    workspacePool = new Map();
    pool.set(workspaceId, workspacePool);
  }

  const existing = workspacePool.get(config.language);
  if (existing) return existing;

  const exec = await resolveExecutable(config);
  if (!exec) {
    // Not installed — cache a null marker is overkill; just return null each call.
    return null;
  }

  let entry: LspEntry | null = null;
  const client = new LspClient({
    languageId: config.language,
    workspaceRoot: workspacePath,
    command: exec.command,
    args: exec.args,
    onDiagnostics: (params) => emitDiagnostics(workspaceId, params),
    onExit: () => {
      if (entry && workspacePool?.get(config.language) === entry) {
        workspacePool.delete(config.language);
      }
    },
  });
  try {
    await client.ready();
  } catch (err) {
    console.error(`[lsp] initialize failed for ${config.language}:`, err);
    await client.shutdown();
    return null;
  }

  entry = { client, languageId: config.language, openFiles: new Set() };
  workspacePool.set(config.language, entry);
  return entry;
}

async function getEntryForFile(
  workspaceId: string,
  filePath: string,
): Promise<LspEntry | null> {
  const workspacePool = pool.get(workspaceId);
  if (!workspacePool) return null;
  const config = getLanguageConfigForFilePath(filePath);
  if (!config) return null;
  return workspacePool.get(config.language) ?? null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function openDocument(
  workspaceId: string,
  filePath: string,
  content: string,
): Promise<{ ok: boolean; languageId?: string }> {
  const workspacePath = getWorkspacePath(workspaceId);
  if (!workspacePath) return { ok: false };
  const absPath = resolveAbsolutePath(workspacePath, filePath);
  const entry = await ensureServer(workspaceId, workspacePath, absPath);
  if (!entry) return { ok: false };
  await entry.client.openDocument(absPath, content);
  entry.openFiles.add(absPath);
  return { ok: true, languageId: entry.languageId };
}

export async function closeDocument(workspaceId: string, filePath: string): Promise<void> {
  const workspacePath = getWorkspacePath(workspaceId);
  if (!workspacePath) return;
  const absPath = resolveAbsolutePath(workspacePath, filePath);
  const entry = await getEntryForFile(workspaceId, absPath);
  if (!entry) return;
  await entry.client.closeDocument(absPath);
  entry.openFiles.delete(absPath);
}

export async function requestForFile<T>(
  workspaceId: string,
  filePath: string,
  method: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params: any,
): Promise<T | null> {
  const workspacePath = getWorkspacePath(workspaceId);
  if (!workspacePath) return null;
  const absPath = resolveAbsolutePath(workspacePath, filePath);
  const entry = await getEntryForFile(workspaceId, absPath);
  if (!entry) return null;
  // Rewrite textDocument.uri to absolute file URI in case the caller sent a relative path.
  if (params && typeof params === "object" && params.textDocument?.uri) {
    params.textDocument.uri = filePathToUri(absPath);
  }
  return entry.client.request<T>(method, params);
}

export function getCurrentDiagnostics(
  workspaceId: string,
  filePath: string,
): Diagnostic[] {
  const workspacePath = getWorkspacePath(workspaceId);
  if (!workspacePath) return [];
  const absPath = resolveAbsolutePath(workspacePath, filePath);
  const workspacePool = pool.get(workspaceId);
  if (!workspacePool) return [];
  const config = getLanguageConfigForFilePath(absPath);
  if (!config) return [];
  const entry = workspacePool.get(config.language);
  return entry?.client.getDiagnostics(absPath) ?? [];
}

export function subscribeDiagnostics(
  workspaceId: string,
  cb: DiagnosticsCallback,
): () => void {
  let set = diagnosticsSubscribers.get(workspaceId);
  if (!set) {
    set = new Set();
    diagnosticsSubscribers.set(workspaceId, set);
  }
  set.add(cb);
  return () => {
    const s = diagnosticsSubscribers.get(workspaceId);
    if (!s) return;
    s.delete(cb);
    if (s.size === 0) diagnosticsSubscribers.delete(workspaceId);
  };
}

export async function shutdownWorkspace(workspaceId: string): Promise<void> {
  const workspacePool = pool.get(workspaceId);
  if (!workspacePool) return;
  pool.delete(workspaceId);
  diagnosticsSubscribers.delete(workspaceId);
  await Promise.all(
    Array.from(workspacePool.values()).map((entry) =>
      entry.client.shutdown().catch((err) =>
        console.warn(`[lsp] shutdown for ${entry.languageId} threw:`, err),
      ),
    ),
  );
}

/**
 * Convert open URIs from the server back to absolute file paths.
 * Used by the WebSocket bridge to translate publishDiagnostics URIs.
 */
export function uriToPath(uri: string): string {
  return uriToFilePath(uri);
}

// ─── Agent tool integration ───────────────────────────────────────────────────

/**
 * Build the set of LSP-backed tools for a session. Returns an empty array when
 * the workspace has no path (defensive — should not happen for valid sessions).
 *
 * Tools open the relevant file on demand by reading it from disk. They never
 * fail loudly; a missing language server returns a "no server available" text
 * response so the agent can react gracefully.
 */
export async function getLspToolsForSession(
  workspaceId: string,
  workspacePath: string,
): Promise<ToolDefinition[]> {
  const resolvePath = (file: string) => resolveAbsolutePath(workspacePath, file);

  const helpers: LspToolHelpers = {
    async prepare(file) {
      const absPath = resolvePath(file);
      const entry = await ensureServer(workspaceId, workspacePath, absPath);
      if (!entry) return false;
      if (!entry.client.isOpen(absPath)) {
        try {
          const content = await fs.readFile(absPath, "utf8");
          await entry.client.openDocument(absPath, content);
          entry.openFiles.add(absPath);
        } catch (err) {
          console.warn(`[lsp] tool prepare: failed to open ${absPath}:`, err);
          return false;
        }
      }
      return true;
    },
    async diagnostics(file) {
      const absPath = resolvePath(file);
      const entry = await getEntryForFile(workspaceId, absPath);
      if (!entry) return [];
      const diags = await entry.client.waitForDiagnostics(absPath);
      return diags.map((d) => ({ message: d.message, severity: d.severity, range: d.range }));
    },
  };

  return buildLspTools(helpers);
}
