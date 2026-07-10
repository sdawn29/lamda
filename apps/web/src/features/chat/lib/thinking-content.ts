// react-markdown intentionally escapes raw HTML, which makes model-emitted
// comment separators visible as `<!-- -->` inside reasoning blocks. Comments
// are presentation metadata rather than useful reasoning, so remove both raw
// and entity-escaped forms before word reveal and Markdown rendering.
const HTML_COMMENT = /<!--[\s\S]*?-->/g
const TRAILING_HTML_COMMENT = /<!--[\s\S]*$/
const ESCAPED_HTML_COMMENT = /&lt;!--[\s\S]*?--&gt;/gi
const TRAILING_ESCAPED_HTML_COMMENT = /&lt;!--[\s\S]*$/i

export function cleanThinkingContent(content: string): string {
  return content
    .replace(HTML_COMMENT, "")
    .replace(TRAILING_HTML_COMMENT, "")
    .replace(ESCAPED_HTML_COMMENT, "")
    .replace(TRAILING_ESCAPED_HTML_COMMENT, "")
}
