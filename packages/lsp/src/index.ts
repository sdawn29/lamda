/**
 * @lamda/lsp — Language Server Protocol support for lamda.
 *
 * Provides a thin LspClient wrapping a single language server child process
 * (via JSON-RPC over stdio), a language registry mapping file extensions to
 * servers, and helpers to convert LSP capabilities into pi-sdk tools.
 */

export { LspClient, filePathToUri, uriToFilePath } from "./client.js";
export type { LspClientOptions } from "./client.js";
export {
  getLanguageConfigForExtension,
  getLanguageConfigForFilePath,
  resolveExecutable,
} from "./registry.js";
export { buildLspTools } from "./converter.js";
export type { LspToolHelpers } from "./converter.js";
export type {
  LspServerConfig,
  DiagnosticsUpdate,
  Diagnostic,
  Hover,
  Location,
  DocumentSymbol,
  SymbolInformation,
  Position,
} from "./types.js";
