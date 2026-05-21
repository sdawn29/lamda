/**
 * LSP Client — thin wrapper around a single language server child process.
 *
 * One instance per (workspace, language). Owns the child process, the JSON-RPC
 * connection, open-document state, and the latest diagnostics per URI.
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { pathToFileURL } from "node:url";
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
  type MessageConnection,
} from "vscode-jsonrpc/node";
import type {
  InitializeParams,
  InitializeResult,
  PublishDiagnosticsParams,
  Diagnostic,
  Hover,
  Location,
  LocationLink,
  DocumentSymbol,
  SymbolInformation,
  Position,
} from "vscode-languageserver-protocol";

export interface LspClientOptions {
  /** LSP languageId (e.g., "typescript"). */
  languageId: string;
  /** Absolute path to the workspace root. */
  workspaceRoot: string;
  /** Command to spawn. */
  command: string;
  /** Arguments to pass to the command. */
  args: string[];
  /** Called whenever the server publishes diagnostics for a document. */
  onDiagnostics?: (params: PublishDiagnosticsParams) => void;
  /** Called when the server process exits unexpectedly. */
  onExit?: (code: number | null) => void;
}

export class LspClient {
  private proc: ChildProcessWithoutNullStreams;
  private connection: MessageConnection;
  private languageId: string;
  private workspaceRoot: string;
  private openDocs = new Map<string, number>(); // uri → version
  private diagnosticsByUri = new Map<string, Diagnostic[]>();
  private diagnosticsWaiters = new Map<string, Set<(diags: Diagnostic[]) => void>>();
  private starting: Promise<void>;
  private disposed = false;

  constructor(opts: LspClientOptions) {
    this.languageId = opts.languageId;
    this.workspaceRoot = opts.workspaceRoot;

    this.proc = spawn(opts.command, opts.args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });

    this.proc.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8").trim();
      if (text) console.error(`[lsp:${this.languageId}] stderr:`, text);
    });

    this.proc.on("exit", (code) => {
      if (!this.disposed) {
        console.error(`[lsp:${this.languageId}] server exited unexpectedly code=${code}`);
        opts.onExit?.(code);
      }
    });

    this.connection = createMessageConnection(
      new StreamMessageReader(this.proc.stdout),
      new StreamMessageWriter(this.proc.stdin),
    );

    this.connection.onNotification(
      "textDocument/publishDiagnostics",
      (params: PublishDiagnosticsParams) => {
        this.diagnosticsByUri.set(params.uri, params.diagnostics);
        const waiters = this.diagnosticsWaiters.get(params.uri);
        if (waiters) {
          this.diagnosticsWaiters.delete(params.uri);
          for (const w of waiters) w(params.diagnostics);
        }
        opts.onDiagnostics?.(params);
      },
    );

    // Some servers send window/logMessage; route to console for debugging.
    this.connection.onNotification("window/logMessage", (params: { type: number; message: string }) => {
      if (params.type <= 2) console.error(`[lsp:${this.languageId}]`, params.message);
    });
    // Discard window/showMessage and telemetry/event — they are noisy.
    this.connection.onNotification("window/showMessage", () => {});
    this.connection.onNotification("telemetry/event", () => {});
    // Acknowledge requests we don't implement to keep the server happy.
    this.connection.onRequest("workspace/configuration", () => []);
    this.connection.onRequest("client/registerCapability", () => null);
    this.connection.onRequest("window/workDoneProgress/create", () => null);

    this.connection.listen();

    this.starting = this.initialize();
  }

  private async initialize(): Promise<void> {
    const rootUri = pathToFileURL(this.workspaceRoot).toString();
    const params: InitializeParams = {
      processId: process.pid,
      clientInfo: { name: "lamda", version: "0.1.0" },
      rootUri,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rootPath: this.workspaceRoot as any,
      workspaceFolders: [{ uri: rootUri, name: "workspace" }],
      capabilities: {
        textDocument: {
          synchronization: { didSave: false, willSave: false, dynamicRegistration: false },
          hover: { contentFormat: ["markdown", "plaintext"] },
          definition: { linkSupport: false },
          references: {},
          documentSymbol: { hierarchicalDocumentSymbolSupport: true },
          publishDiagnostics: { relatedInformation: false },
        },
        workspace: {
          workspaceFolders: true,
          configuration: true,
        },
      },
      initializationOptions: {},
    };
    await this.connection.sendRequest<InitializeResult>("initialize", params);
    this.connection.sendNotification("initialized", {});
  }

  /** Resolve once the server has finished initialize. */
  ready(): Promise<void> {
    return this.starting;
  }

  /** Open a document. Calls didChange instead if it's already open. */
  async openDocument(filePath: string, content: string): Promise<void> {
    await this.starting;
    const uri = filePathToUri(filePath);
    const existing = this.openDocs.get(uri);
    if (existing !== undefined) {
      const version = existing + 1;
      this.openDocs.set(uri, version);
      this.connection.sendNotification("textDocument/didChange", {
        textDocument: { uri, version },
        contentChanges: [{ text: content }],
      });
      return;
    }
    this.openDocs.set(uri, 1);
    this.connection.sendNotification("textDocument/didOpen", {
      textDocument: { uri, languageId: this.languageId, version: 1, text: content },
    });
  }

  async closeDocument(filePath: string): Promise<void> {
    const uri = filePathToUri(filePath);
    if (!this.openDocs.has(uri)) return;
    this.openDocs.delete(uri);
    this.diagnosticsByUri.delete(uri);
    this.connection.sendNotification("textDocument/didClose", { textDocument: { uri } });
  }

  isOpen(filePath: string): boolean {
    return this.openDocs.has(filePathToUri(filePath));
  }

  getDiagnostics(filePath: string): Diagnostic[] {
    return this.diagnosticsByUri.get(filePathToUri(filePath)) ?? [];
  }

  /**
   * Wait until the server has published diagnostics for the file at least once.
   * Resolves immediately if diagnostics were already received. Otherwise resolves
   * when the next publishDiagnostics arrives for the URI, or on timeout.
   */
  waitForDiagnostics(filePath: string, timeoutMs = 3000): Promise<Diagnostic[]> {
    const uri = filePathToUri(filePath);
    const existing = this.diagnosticsByUri.get(uri);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve) => {
      let settled = false;
      const finish = (diags: Diagnostic[]) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const set = this.diagnosticsWaiters.get(uri);
        set?.delete(finish);
        if (set && set.size === 0) this.diagnosticsWaiters.delete(uri);
        resolve(diags);
      };
      let set = this.diagnosticsWaiters.get(uri);
      if (!set) {
        set = new Set();
        this.diagnosticsWaiters.set(uri, set);
      }
      set.add(finish);
      const timer = setTimeout(() => finish(this.diagnosticsByUri.get(uri) ?? []), timeoutMs);
    });
  }

  async hover(filePath: string, position: Position): Promise<Hover | null> {
    await this.starting;
    return this.connection.sendRequest<Hover | null>("textDocument/hover", {
      textDocument: { uri: filePathToUri(filePath) },
      position,
    });
  }

  async definition(
    filePath: string,
    position: Position,
  ): Promise<Location | Location[] | LocationLink[] | null> {
    await this.starting;
    return this.connection.sendRequest("textDocument/definition", {
      textDocument: { uri: filePathToUri(filePath) },
      position,
    });
  }

  async references(
    filePath: string,
    position: Position,
    includeDeclaration = true,
  ): Promise<Location[] | null> {
    await this.starting;
    return this.connection.sendRequest<Location[] | null>("textDocument/references", {
      textDocument: { uri: filePathToUri(filePath) },
      position,
      context: { includeDeclaration },
    });
  }

  async documentSymbols(
    filePath: string,
  ): Promise<DocumentSymbol[] | SymbolInformation[] | null> {
    await this.starting;
    return this.connection.sendRequest("textDocument/documentSymbol", {
      textDocument: { uri: filePathToUri(filePath) },
    });
  }

  /** Generic request — used by the WS bridge. */
  async request<T>(method: string, params: unknown): Promise<T> {
    await this.starting;
    return this.connection.sendRequest<T>(method, params);
  }

  async shutdown(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    try {
      await this.connection.sendRequest("shutdown");
      this.connection.sendNotification("exit");
    } catch (err) {
      console.warn(`[lsp:${this.languageId}] shutdown error (ignoring):`, err);
    }
    this.connection.dispose();
    try {
      this.proc.kill();
    } catch {}
  }
}

export function filePathToUri(filePath: string): string {
  return pathToFileURL(filePath).toString();
}

export function uriToFilePath(uri: string): string {
  if (uri.startsWith("file://")) {
    return decodeURIComponent(uri.slice("file://".length));
  }
  return uri;
}
