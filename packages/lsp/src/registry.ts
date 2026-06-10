/**
 * Hardcoded language registry: file extension → which language server to use.
 *
 * Servers are looked up on the user's PATH at spawn time; if a server isn't
 * installed the call site degrades gracefully (no diagnostics, no overlays).
 *
 * Each server may carry an install spec describing how to install it via a
 * package-manager tool (npm, pip, rustup, go). The server exposes these to the
 * settings UI so missing servers can be installed in-app.
 *
 * To support a new language: add an entry below.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { LspInstallSpec, LspServerCommand, LspServerConfig } from "./types.js";

const execFileP = promisify(execFile);

const npmInstall = (...packages: string[]): LspInstallSpec => ({
  tool: "npm",
  command: "npm",
  args: ["install", "-g", ...packages],
});

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
    install: npmInstall("pyright"),
    fallbacks: [
      {
        command: "pylsp",
        args: [],
        install: { tool: "pip3", command: "pip3", args: ["install", "python-lsp-server"] },
      },
    ],
  },

  rs: {
    language: "rust",
    command: "rust-analyzer",
    args: [],
    install: { tool: "rustup", command: "rustup", args: ["component", "add", "rust-analyzer"] },
  },

  go: {
    language: "go",
    command: "gopls",
    args: ["serve"],
    install: { tool: "go", command: "go", args: ["install", "golang.org/x/tools/gopls@latest"] },
  },

  sh: shellConfig(),
  bash: shellConfig(),
  zsh: shellConfig(),

  yaml: yamlConfig(),
  yml: yamlConfig(),

  json: jsonConfig(),
  jsonc: jsonConfig(),

  css: cssConfig(),
  scss: cssConfig(),
  less: cssConfig(),

  html: {
    language: "html",
    command: "vscode-html-language-server",
    args: ["--stdio"],
    install: npmInstall("vscode-langservers-extracted"),
  },
};

function typescriptConfig(languageId: string): LspServerConfig {
  return {
    language: languageId,
    command: "typescript-language-server",
    args: ["--stdio"],
    install: npmInstall("typescript-language-server", "typescript"),
  };
}

function shellConfig(): LspServerConfig {
  return {
    language: "shellscript",
    command: "bash-language-server",
    args: ["start"],
    install: npmInstall("bash-language-server"),
  };
}

function yamlConfig(): LspServerConfig {
  return {
    language: "yaml",
    command: "yaml-language-server",
    args: ["--stdio"],
    install: npmInstall("yaml-language-server"),
  };
}

function jsonConfig(): LspServerConfig {
  return {
    language: "json",
    command: "vscode-json-language-server",
    args: ["--stdio"],
    install: npmInstall("vscode-langservers-extracted"),
  };
}

function cssConfig(): LspServerConfig {
  return {
    language: "css",
    command: "vscode-css-language-server",
    args: ["--stdio"],
    install: npmInstall("vscode-langservers-extracted"),
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
  /** How to install the primary binary, when known. */
  install?: LspInstallSpec;
  /** Optional fallbacks tried when the primary is not on PATH. */
  fallbacks: LspServerCommand[];
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
      install: config.install,
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
