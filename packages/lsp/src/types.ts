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
  SignatureHelp,
} from "vscode-languageserver-protocol";

/**
 * How to install a language server binary. `tool` is the package-manager
 * binary that must already be on PATH for the install to be possible.
 */
export interface LspInstallSpec {
  /** Required tool, e.g. "npm", "pip3", "rustup", "go". */
  tool: string;
  /** Command to run (usually the same as `tool`). */
  command: string;
  /** Full argument list. Fixed at build time — never user input. */
  args: string[];
}

/** A launchable server command, optionally with an install recipe. */
export interface LspServerCommand {
  /** Binary name to spawn (resolved against PATH). */
  command: string;
  /** Arguments to pass to the binary. Most LSPs need `--stdio` or similar. */
  args: string[];
  /** How to install this binary, when known. */
  install?: LspInstallSpec;
}

/**
 * A language registry entry: how to find and launch a language server for a
 * particular language id.
 */
export interface LspServerConfig extends LspServerCommand {
  /** LSP languageId (e.g., "typescript", "python"). */
  language: string;
  /**
   * Optional list of fallback commands tried in order if the primary command
   * is not on PATH. Useful for Python where pyright vs pylsp coexist.
   */
  fallbacks?: LspServerCommand[];
}

/**
 * A diagnostic for a specific document, scoped to a workspace.
 */
export interface DiagnosticsUpdate {
  uri: string;
  diagnostics: Diagnostic[];
}

export type { Diagnostic, Hover, Location, DocumentSymbol, SymbolInformation, Position, SignatureHelp };
