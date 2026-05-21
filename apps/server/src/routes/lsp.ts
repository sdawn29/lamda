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
      send(ws, { kind: "response", id: 0, error: `Invalid JSON: ${String(err)}` });
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
        send(ws, { kind: "diagnostics", filePath: msg.filePath, diagnostics: existing });
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
      const result = await requestForFile(workspaceId, msg.filePath, msg.method, msg.params);
      send(ws, { kind: "response", id: msg.id, result });
      return;
    }
  }
}
