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

const isWindows = process.platform === "win32";

async function isOnPath(command: string): Promise<boolean> {
  try {
    await execFileP(isWindows ? "where" : "which", [command]);
    return true;
  } catch {
    return false;
  }
}
