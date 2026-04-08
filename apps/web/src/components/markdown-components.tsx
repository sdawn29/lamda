import { useState } from "react"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import SyntaxHighlighterAuto from "react-syntax-highlighter"
import {
  jellybeansdark,
  jellybeanslight,
  jellybeanshljsdark,
  jellybeanshljslight,
} from "@/lib/syntax-theme"
import type { Components } from "react-markdown"
import { useTheme } from "@/components/theme-provider"
import { Check, Copy } from "lucide-react"

function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <button
      onClick={handleCopy}
      className="absolute top-2 right-2 rounded-md border border-border bg-background p-1.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
      aria-label="Copy code"
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  )
}

function CodeBlock({
  className,
  children,
}: {
  className?: string
  children?: React.ReactNode
}) {
  const { theme } = useTheme()
  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches)
  const match = /language-(\w+)/.exec(className ?? "")
  const code = String(children).replace(/\n$/, "")

  if (match) {
    return (
      <div className="group relative my-4 overflow-hidden rounded-lg border border-border">
        <CopyButton code={code} />
        <SyntaxHighlighter
          language={match[1]}
          style={isDark ? jellybeansdark : jellybeanslight}
          PreTag="div"
          showLineNumbers
          lineNumberStyle={{
            minWidth: "2.5em",
            paddingRight: "1em",
            userSelect: "none",
            opacity: 0.4,
            fontSize: "0.75rem",
          }}
          customStyle={{
            margin: 0,
            borderRadius: 0,
            fontSize: "0.75rem",
            lineHeight: "1.6",
            background: "transparent",
          }}
          codeTagProps={{
            style: {
              fontFamily: "var(--font-mono, ui-monospace, monospace)",
              fontWeight: "normal",
              fontSize: "0.75rem",
              fontSize: "0.75rem",
            },
          }}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    )
  }

  // Code block without a language specifier — use hljs auto-detection
  return (
    <div className="group relative my-4 overflow-hidden rounded-lg border border-border">
      <CopyButton code={code} />
      <SyntaxHighlighterAuto
        style={isDark ? jellybeanshljsdark : jellybeanshljslight}
        PreTag="div"
        showLineNumbers
        lineNumberStyle={{
          minWidth: "2.5em",
          paddingRight: "1em",
          userSelect: "none",
          opacity: 0.4,
          fontSize: "0.75rem",
        }}
        customStyle={{
          margin: 0,
          borderRadius: 0,
          fontSize: "0.75rem",
          lineHeight: "1.6",
          background: "transparent",
        }}
        codeTagProps={{
          style: {
            fontFamily: "var(--font-mono, ui-monospace, monospace)",
            fontWeight: "normal",
          },
        }}
      >
        {code}
      </SyntaxHighlighterAuto>
    </div>
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
    const isBlock =
      String(children).endsWith("\n") || className?.startsWith("language-")
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
