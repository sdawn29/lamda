export interface FileCommentContext {
  path: string
  line: number
  comment: string
  code?: string
}

export const FILE_CONTEXT_RE =
  /<file-context\s+path="([^"]+)"\s+line="(\d+)"(?:\s+code="([^"]*)")?>([\s\S]*?)<\/file-context>/g

export function escapeFileContextValue(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}

export function unescapeFileContextValue(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
}

export function formatFileCommentContext(context: FileCommentContext): string {
  const code = context.code?.trim()
  const codeAttr = code
    ? ` code="${escapeFileContextValue(code.slice(0, 240))}"`
    : ""
  return `<file-context path="${escapeFileContextValue(context.path)}" line="${context.line}"${codeAttr}>${escapeFileContextValue(context.comment.trim())}</file-context>`
}

export function parseFileCommentContext(
  match: RegExpExecArray
): FileCommentContext {
  return {
    path: unescapeFileContextValue(match[1] ?? ""),
    line: Number(match[2] ?? "0"),
    code: match[3] ? unescapeFileContextValue(match[3]) : undefined,
    comment: unescapeFileContextValue(match[4] ?? ""),
  }
}
