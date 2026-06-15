export interface FileCommentContext {
  path: string
  line: number
  startColumn?: number
  endLine?: number
  endColumn?: number
  comment: string
  code?: string
}

export const FILE_CONTEXT_RE =
  /<file-context\s+path="([^"]+)"\s+line="(\d+)"(?:\s+start-column="(\d+)")?(?:\s+end-line="(\d+)")?(?:\s+end-column="(\d+)")?(?:\s+code="([^"]*)")?>([\s\S]*?)<\/file-context>/g

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
  const startColumnAttr = context.startColumn
    ? ` start-column="${context.startColumn}"`
    : ""
  const endLineAttr =
    context.endLine && context.endLine !== context.line
      ? ` end-line="${context.endLine}"`
      : ""
  const endColumnAttr = context.endColumn
    ? ` end-column="${context.endColumn}"`
    : ""
  const codeAttr = code
    ? ` code="${escapeFileContextValue(code.slice(0, 240))}"`
    : ""
  return `<file-context path="${escapeFileContextValue(context.path)}" line="${context.line}"${startColumnAttr}${endLineAttr}${endColumnAttr}${codeAttr}>${escapeFileContextValue(context.comment.trim())}</file-context>`
}

export function parseFileCommentContext(
  match: RegExpExecArray
): FileCommentContext {
  return {
    path: unescapeFileContextValue(match[1] ?? ""),
    line: Number(match[2] ?? "0"),
    startColumn: match[3] ? Number(match[3]) : undefined,
    endLine: match[4] ? Number(match[4]) : undefined,
    endColumn: match[5] ? Number(match[5]) : undefined,
    code: match[6] ? unescapeFileContextValue(match[6]) : undefined,
    comment: unescapeFileContextValue(match[7] ?? ""),
  }
}
