/**
 * Shared file extension → language id mapping used by the Prism viewer and
 * the LSP client (so both pick the same language id for the same file).
 */

export const LANGUAGE_MAP: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  mts: "typescript",
  cts: "typescript",
  js: "javascript",
  jsx: "jsx",
  mjs: "javascript",
  cjs: "javascript",
  mjsx: "jsx",
  cjsx: "jsx",
  py: "python",
  rb: "ruby",
  rs: "rust",
  yml: "yaml",
  md: "markdown",
}

export function getLanguageForFileName(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? ""
  return LANGUAGE_MAP[ext] ?? ext
}
