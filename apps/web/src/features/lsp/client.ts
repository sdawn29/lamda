/**
 * Client-side LSP WebSocket connection. One per workspaceId, shared by all
 * file viewers in that workspace.
 *
 * Maintains:
 *   - request/response correlation via incrementing ids
 *   - per-file diagnostic state pushed by the server
 *   - per-file open ref-counting (so multiple viewers of the same file open
 *     it once and close when the last viewer unmounts)
 */

import { appendToken, getServerWsUrl } from "@/shared/lib/client"
import type {
  Diagnostic,
  DocumentSymbolResult,
  Hover,
  Location,
  LocationLink,
  Position,
  SignatureHelp,
} from "./types"

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (err: Error) => void
}

type DiagnosticsListener = (filePath: string, diagnostics: Diagnostic[]) => void

const EMPTY_DIAGNOSTICS: Diagnostic[] = []

export class LspConnection {
  private ws: WebSocket | null = null
  private readonly workspaceId: string
  private nextId = 1
  private pending = new Map<number, PendingRequest>()
  private diagnosticsByFile = new Map<string, Diagnostic[]>()
  private diagnosticsListeners = new Set<DiagnosticsListener>()
  private openCounts = new Map<string, number>()
  private openContents = new Map<string, string>()
  private connectPromise: Promise<void> | null = null
  private disposed = false

  constructor(workspaceId: string) {
    this.workspaceId = workspaceId
  }

  private async connect(): Promise<void> {
    if (this.disposed) throw new Error("LspConnection disposed")
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return
    if (this.connectPromise) return this.connectPromise

    this.connectPromise = (async () => {
      const base = await getServerWsUrl()
      const url = `${base}/ws/workspace/${encodeURIComponent(this.workspaceId)}/lsp`
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(appendToken(url))
        this.ws = ws
        ws.onopen = () => resolve()
        ws.onerror = () => reject(new Error("LSP WebSocket error"))
        ws.onclose = () => {
          this.ws = null
          this.connectPromise = null
          // Reject any in-flight requests so callers don't hang.
          for (const [, req] of this.pending) {
            req.reject(new Error("LSP connection closed"))
          }
          this.pending.clear()
        }
        ws.onmessage = (ev) => this.handleMessage(ev.data)
      })
    })()
    try {
      await this.connectPromise
    } finally {
      this.connectPromise = null
    }
  }

  private handleMessage(raw: unknown) {
    let msg: { kind: string; id?: number; result?: unknown; error?: string; filePath?: string; diagnostics?: Diagnostic[] }
    try {
      msg = JSON.parse(String(raw))
    } catch {
      return
    }
    if (msg.kind === "response" && typeof msg.id === "number") {
      const req = this.pending.get(msg.id)
      if (req) {
        this.pending.delete(msg.id)
        if (msg.error) req.reject(new Error(msg.error))
        else req.resolve(msg.result)
      }
      return
    }
    if (msg.kind === "diagnostics" && msg.filePath && msg.diagnostics) {
      this.diagnosticsByFile.set(msg.filePath, msg.diagnostics)
      for (const cb of this.diagnosticsListeners) {
        try {
          cb(msg.filePath, msg.diagnostics)
        } catch (err) {
          console.error("[lsp] listener error:", err)
        }
      }
    }
  }

  private async send(payload: object): Promise<unknown> {
    await this.connect()
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("LSP WebSocket not open")
    }
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      try {
        this.ws!.send(JSON.stringify({ ...payload, id }))
      } catch (err) {
        this.pending.delete(id)
        reject(err as Error)
      }
    })
  }

  // ── Document lifecycle ─────────────────────────────────────────────────────

  async openDocument(filePath: string, content: string): Promise<void> {
    const existing = this.openCounts.get(filePath) ?? 0
    if (existing > 0 && this.openContents.get(filePath) === content) {
      this.openCounts.set(filePath, existing + 1)
      return
    }
    this.openCounts.set(filePath, existing + 1)
    this.openContents.set(filePath, content)
    await this.send({ kind: "open", filePath, content })
  }

  async closeDocument(filePath: string): Promise<void> {
    const count = this.openCounts.get(filePath) ?? 0
    if (count <= 1) {
      this.openCounts.delete(filePath)
      this.openContents.delete(filePath)
      this.diagnosticsByFile.delete(filePath)
      try {
        await this.send({ kind: "close", filePath })
      } catch {
        // Connection might already be closed during teardown — fine.
      }
      return
    }
    this.openCounts.set(filePath, count - 1)
  }

  // ── Diagnostics subscriptions ─────────────────────────────────────────────

  getDiagnostics(filePath: string): Diagnostic[] {
    return this.diagnosticsByFile.get(filePath) ?? EMPTY_DIAGNOSTICS
  }

  subscribeDiagnostics(cb: DiagnosticsListener): () => void {
    this.diagnosticsListeners.add(cb)
    return () => {
      this.diagnosticsListeners.delete(cb)
    }
  }

  // ── Requests ──────────────────────────────────────────────────────────────

  async hover(filePath: string, position: Position): Promise<Hover | null> {
    return (await this.send({
      kind: "request",
      filePath,
      method: "textDocument/hover",
      params: { textDocument: { uri: "" }, position },
    })) as Hover | null
  }

  async definition(
    filePath: string,
    position: Position,
  ): Promise<Location | Location[] | LocationLink[] | null> {
    return (await this.send({
      kind: "request",
      filePath,
      method: "textDocument/definition",
      params: { textDocument: { uri: "" }, position },
    })) as Location | Location[] | LocationLink[] | null
  }

  async signatureHelp(
    filePath: string,
    position: Position,
  ): Promise<SignatureHelp | null> {
    return (await this.send({
      kind: "request",
      filePath,
      method: "textDocument/signatureHelp",
      params: { textDocument: { uri: "" }, position },
    })) as SignatureHelp | null
  }

  async references(filePath: string, position: Position): Promise<Location[] | null> {
    return (await this.send({
      kind: "request",
      filePath,
      method: "textDocument/references",
      params: {
        textDocument: { uri: "" },
        position,
        context: { includeDeclaration: true },
      },
    })) as Location[] | null
  }

  async documentSymbols(filePath: string): Promise<DocumentSymbolResult | null> {
    return (await this.send({
      kind: "request",
      filePath,
      method: "textDocument/documentSymbol",
      params: { textDocument: { uri: "" } },
    })) as DocumentSymbolResult | null
  }

  dispose() {
    this.disposed = true
    try {
      this.ws?.close()
    } catch {
      // ignored
    }
    this.ws = null
    this.pending.clear()
    this.openCounts.clear()
    this.openContents.clear()
    this.diagnosticsListeners.clear()
    this.diagnosticsByFile.clear()
  }
}

// ── Singleton pool keyed by workspaceId ──────────────────────────────────────

const connections = new Map<string, LspConnection>()

export function getLspConnection(workspaceId: string): LspConnection {
  let conn = connections.get(workspaceId)
  if (!conn) {
    conn = new LspConnection(workspaceId)
    connections.set(workspaceId, conn)
  }
  return conn
}

export function disposeLspConnection(workspaceId: string) {
  const conn = connections.get(workspaceId)
  if (!conn) return
  conn.dispose()
  connections.delete(workspaceId)
}
