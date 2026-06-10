/**
 * LSP WebSocket bridge.
 *
 * Endpoint: /ws/workspace/:workspaceId/lsp
 *
 * Protocol (compact custom envelopes, not raw LSP):
 *   Client → server:
 *     { kind: "open",    id, filePath, content }
 *     { kind: "close",   id, filePath }
 *     { kind: "request", id, filePath, method, params }
 *   Server → client:
 *     { kind: "response", id, result?, error? }
 *     { kind: "diagnostics", filePath, diagnostics }
 *
 * Diagnostics are pushed for every open document in the workspace, not just
 * those this client opened — the client filters by filePath. This keeps
 * the bridge stateless about which client opened what.
 */

import type { WebSocket } from "ws";
import { Hono } from "hono";
import { listLanguageRegistry, isCommandOnPath } from "@lamda/lsp";
import {
  getInstallJobs,
  resolveInstallCandidate,
  startInstall,
} from "../services/lsp-installer.js";
import {
  openDocument,
  closeDocument,
  requestForFile,
  getCurrentDiagnostics,
  subscribeDiagnostics,
  uriToPath,
} from "../services/language-service.js";

interface OpenMsg {
  kind: "open";
  id: number;
  filePath: string;
  content: string;
}
interface CloseMsg {
  kind: "close";
  id: number;
  filePath: string;
}
interface RequestMsg {
  kind: "request";
  id: number;
  filePath: string;
  method: string;
  params: Record<string, unknown>;
}
type ClientMsg = OpenMsg | CloseMsg | RequestMsg;

function send(ws: WebSocket, payload: unknown) {
  if (ws.readyState === 1 /* OPEN */) {
    ws.send(JSON.stringify(payload));
  }
}

export function handleLspWs(ws: WebSocket, workspaceId: string) {
  const ownedFiles = new Set<string>();

  const unsubscribe = subscribeDiagnostics(workspaceId, (params) => {
    send(ws, {
      kind: "diagnostics",
      filePath: uriToPath(params.uri),
      diagnostics: params.diagnostics,
    });
  });

  ws.on("message", (raw) => {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(raw.toString()) as ClientMsg;
    } catch (err) {
      send(ws, {
        kind: "response",
        id: 0,
        error: `Invalid JSON: ${String(err)}`,
      });
      return;
    }

    void handleMessage(workspaceId, msg, ws, ownedFiles).catch((err) => {
      send(ws, {
        kind: "response",
        id: msg.id ?? 0,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  });

  ws.on("close", () => {
    unsubscribe();
    // Best-effort close for documents this connection opened.
    for (const filePath of ownedFiles) {
      void closeDocument(workspaceId, filePath).catch(() => {});
    }
    ownedFiles.clear();
  });

  ws.on("error", () => {
    unsubscribe();
    ownedFiles.clear();
  });
}

async function handleMessage(
  workspaceId: string,
  msg: ClientMsg,
  ws: WebSocket,
  ownedFiles: Set<string>,
): Promise<void> {
  switch (msg.kind) {
    case "open": {
      const result = await openDocument(workspaceId, msg.filePath, msg.content);
      if (result.ok) ownedFiles.add(msg.filePath);
      send(ws, { kind: "response", id: msg.id, result });
      // Replay any cached diagnostics for this file so newly-connecting clients
      // see existing errors without waiting for a publish.
      const existing = getCurrentDiagnostics(workspaceId, msg.filePath);
      if (existing.length > 0) {
        send(ws, {
          kind: "diagnostics",
          filePath: msg.filePath,
          diagnostics: existing,
        });
      }
      return;
    }
    case "close": {
      await closeDocument(workspaceId, msg.filePath);
      ownedFiles.delete(msg.filePath);
      send(ws, { kind: "response", id: msg.id, result: { ok: true } });
      return;
    }
    case "request": {
      const result = await requestForFile(
        workspaceId,
        msg.filePath,
        msg.method,
        msg.params,
      );
      send(ws, { kind: "response", id: msg.id, result });
      return;
    }
  }
}

// ─── HTTP router ────────────────────────────────────────────────────────────────

export const lspRouter = new Hono();

/**
 * GET /lsp/registry
 *
 * Returns the built-in language registry with a resolved `installed` flag
 * for the primary command and each fallback. Used by the settings UI to
 * show which language servers are configured and which are available on PATH.
 */
lspRouter.get("/registry", async (c) => {
  const entries = listLanguageRegistry();
  const resolved = await Promise.all(
    entries.map(async (entry) => {
      const primaryInstalled = await isCommandOnPath(entry.command);
      const fallbacks = await Promise.all(
        entry.fallbacks.map(async (fb) => ({
          command: fb.command,
          args: fb.args,
          installed: await isCommandOnPath(fb.command),
        })),
      );
      const available =
        primaryInstalled || fallbacks.some((fb) => fb.installed);
      const installCandidate = available
        ? null
        : await resolveInstallCandidate(entry.language);
      return {
        language: entry.language,
        extensions: entry.extensions,
        command: entry.command,
        args: entry.args,
        installed: primaryInstalled,
        fallbacks,
        available,
        installable: installCandidate !== null,
        installCommand: installCandidate
          ? `${installCandidate.spec.command} ${installCandidate.spec.args.join(" ")}`
          : null,
        // Tool the user would need for the *first* recipe, shown when nothing
        // is installable so the UI can say "requires npm".
        requiredTool: entry.install?.tool ?? entry.fallbacks.find((fb) => fb.install)?.install?.tool ?? null,
      };
    }),
  );
  return c.json({ languages: resolved });
});

/**
 * POST /lsp/install { language }
 *
 * Kicks off the registry's install recipe for that language. Returns 202 with
 * the job; the client polls GET /lsp/install for progress.
 */
lspRouter.post("/install", async (c) => {
  const body = await c.req.json<{ language?: string }>().catch(() => null);
  const language = body?.language;
  if (!language || typeof language !== "string") {
    return c.json({ error: "Missing 'language'." }, 400);
  }
  const result = await startInstall(language);
  if ("error" in result) {
    return c.json({ error: result.error }, 409);
  }
  return c.json({ job: result.job }, 202);
});

/** GET /lsp/install — all install jobs (running and finished). */
lspRouter.get("/install", (c) => {
  return c.json({ jobs: getInstallJobs() });
});
