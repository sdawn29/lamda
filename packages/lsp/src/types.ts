/**
 * Types for the LSP package.
 *
 * We re-export the canonical LSP types from vscode-languageserver-protocol so
 * server/client code can import everything from a single place.
 */

import type {
  Diagnostic,
  Hover,
  Location,
  DocumentSymbol,
  SymbolInformation,
  Position,
} from "vscode-languageserver-protocol";

/**
 * A language registry entry: how to find and launch a language server for a
 * particular language id.
 */
export interface LspServerConfig {
  /** LSP languageId (e.g., "typescript", "python"). */
  language: string;
  /** Binary name to spawn (resolved against PATH). */
  command: string;
  /** Arguments to pass to the binary. Most LSPs need `--stdio` or similar. */
  args: string[];
  /**
   * Optional list of fallback commands tried in order if the primary command
   * is not on PATH. Useful for Python where pyright vs pylsp coexist.
   */
  fallbacks?: Array<{ command: string; args: string[] }>;
}

/**
 * A diagnostic for a specific document, scoped to a workspace.
 */
export interface DiagnosticsUpdate {
  uri: string;
  diagnostics: Diagnostic[];
}

export type { Diagnostic, Hover, Location, DocumentSymbol, SymbolInformation, Position };
