import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import atomDark from "react-syntax-highlighter/dist/esm/styles/prism/atom-dark"
import type { Components } from "react-markdown"

function CodeBlock({
  className,
  children,
}: {
  className?: string
  children?: React.ReactNode
}) {
  const match = /language-(\w+)/.exec(className ?? "")
  const code = String(children).replace(/\n$/, "")

  if (match) {
    return (
      <SyntaxHighlighter
        language={match[1]}
        style={atomDark}
        PreTag="div"
        customStyle={{
          margin: 0,
          borderRadius: "0.5rem",
          fontSize: "0.8125rem",
          lineHeight: "1.6",
        }}
        codeTagProps={{ style: { fontFamily: "inherit" } }}
      >
        {code}
      </SyntaxHighlighter>
    )
  }

  // Code block without a language specifier
  return (
    <pre className="not-prose my-4 overflow-x-auto rounded-lg bg-card px-4 py-3 font-mono text-sm leading-relaxed">
      <code>{children}</code>
    </pre>
  )
}

export const markdownComponents: Components = {
  // ── Tables ──────────────────────────────────────────────────────────────────
  table: ({ children }) => (
    <div className="not-prose my-2 overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted/50">{children}</thead>,
  th: ({ children }) => (
    <th className="border-b border-border px-4 py-2 text-left font-medium">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-border/50 px-4 py-2 last:border-0">
      {children}
    </td>
  ),
  tr: ({ children }) => (
    <tr className="transition-colors hover:bg-muted/30">{children}</tr>
  ),
  // ── Code ────────────────────────────────────────────────────────────────────
  // react-markdown passes fenced code as <pre><code className="language-xxx">
  // We intercept at the `code` level so we can read the language from className.
  // `pre` is suppressed (returns Fragment) so SyntaxHighlighter owns the wrapper.
  pre: ({ children }) => <>{children}</>,
  code: ({ className, children }) => {
    // react-markdown v9+ removed the `inline` prop. The reliable heuristic:
    // remark always appends a trailing "\n" to fenced/indented code block
    // content, but never to inline code spans.
    const isBlock = String(children).endsWith("\n") || className?.startsWith("language-")
    if (!isBlock) {
      return (
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.8125rem]">
          {children}
        </code>
      )
    }
    return <CodeBlock className={className}>{children}</CodeBlock>
  },
  // ── Links ───────────────────────────────────────────────────────────────────
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  ),
}
