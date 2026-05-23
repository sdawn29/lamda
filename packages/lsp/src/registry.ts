/**
 * Hardcoded language registry: file extension → which language server to use.
 *
 * Servers are looked up on the user's PATH at spawn time; if a server isn't
 * installed the call site degrades gracefully (no diagnostics, no overlays).
 *
 * To support a new language: add an entry below.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { LspServerConfig } from "./types.js";

const execFileP = promisify(execFile);

/**
 * Extension (without the leading dot, lowercase) → server config.
 *
 * `language` is the LSP `languageId` value, which most servers care about for
 * `textDocument/didOpen`.
 */
const EXTENSION_REGISTRY: Record<string, LspServerConfig> = {
  ts: typescriptConfig("typescript"),
  tsx: typescriptConfig("typescriptreact"),
  mts: typescriptConfig("typescript"),
  cts: typescriptConfig("typescript"),
  js: typescriptConfig("javascript"),
  jsx: typescriptConfig("javascriptreact"),
  mjs: typescriptConfig("javascript"),
  cjs: typescriptConfig("javascript"),

  py: {
    language: "python",
    command: "pyright-langserver",
    args: ["--stdio"],
    fallbacks: [{ command: "pylsp", args: [] }],
  },

  rs: {
    language: "rust",
    command: "rust-analyzer",
    args: [],
  },

  go: {
    language: "go",
    command: "gopls",
    args: ["serve"],
  },
};

function typescriptConfig(languageId: string): LspServerConfig {
  return {
    language: languageId,
    command: "typescript-language-server",
    args: ["--stdio"],
  };
}

export interface LanguageRegistryEntry {
  /** LSP languageId (e.g., "typescript"). */
  language: string;
  /** File extensions that map to this language (no leading dot). */
  extensions: string[];
  /** Primary binary to spawn. */
  command: string;
  /** Args to pass to the primary binary. */
  args: string[];
  /** Optional fallbacks tried when the primary is not on PATH. */
  fallbacks: Array<{ command: string; args: string[] }>;
}

/**
 * Snapshot of the built-in language registry, grouped by LSP languageId.
 * Useful for surfacing the configured set of language servers in the UI.
 */
export function listLanguageRegistry(): LanguageRegistryEntry[] {
  const byLanguage = new Map<string, LanguageRegistryEntry>();
  for (const [ext, config] of Object.entries(EXTENSION_REGISTRY)) {
    const existing = byLanguage.get(config.language);
    if (existing) {
      existing.extensions.push(ext);
      continue;
    }
    byLanguage.set(config.language, {
      language: config.language,
      extensions: [ext],
      command: config.command,
      args: config.args,
      fallbacks: config.fallbacks ?? [],
    });
  }
  return Array.from(byLanguage.values()).sort((a, b) =>
    a.language.localeCompare(b.language),
  );
}

export function getLanguageConfigForExtension(ext: string): LspServerConfig | null {
  const key = ext.toLowerCase().replace(/^\./, "");
  return EXTENSION_REGISTRY[key] ?? null;
}

export function getLanguageConfigForFilePath(filePath: string): LspServerConfig | null {
  const dot = filePath.lastIndexOf(".");
  if (dot < 0) return null;
  return getLanguageConfigForExtension(filePath.slice(dot + 1));
}

/**
 * Resolve the actual command to run for a config — primary if available,
 * else first installed fallback, else null.
 */
export async function resolveExecutable(
  config: LspServerConfig,
): Promise<{ command: string; args: string[] } | null> {
  if (await isOnPath(config.command)) {
    return { command: config.command, args: config.args };
  }
  for (const fallback of config.fallbacks ?? []) {
    if (await isOnPath(fallback.command)) {
      return { command: fallback.command, args: fallback.args };
    }
  }
  return null;
}

/**
 * Check whether a single command is available on the user's PATH.
 * Exported so server routes can surface per-language install status.
 */
export function isCommandOnPath(command: string): Promise<boolean> {
  return isOnPath(command);
}

const isWindows = process.platform === "win32";

async function isOnPath(command: string): Promise<boolean> {
  try {
    await execFileP(isWindows ? "where" : "which", [command]);
    return true;
  } catch {
    return false;
  }
}
