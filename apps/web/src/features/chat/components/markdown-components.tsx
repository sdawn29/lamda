import { lazy, Suspense, useEffect, useRef, useState } from "react"
import type { Components } from "react-markdown"
import { useSyntaxTheme } from "@/features/themes"
import { Check, Copy } from "lucide-react"

import { Button } from "@/shared/ui/button"

const PrismCode = lazy(() => import("./prism-code"))

function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  function handleCopy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      onClick={handleCopy}
      className="absolute top-2 right-2 opacity-0 group-hover/codeblock:opacity-100"
      aria-label="Copy code"
    >
      {copied ? <Check /> : <Copy />}
    </Button>
  )
}

function CodeBlock({
  className,
  children,
}: {
  className?: string
  children?: React.ReactNode
}) {
  const syntax = useSyntaxTheme()
  const match = /language-(\w+)/.exec(className ?? "")
  const code = String(children).replace(/\n$/, "")

  if (match) {
    return (
      <div className="group/codeblock relative my-4 overflow-hidden rounded-lg border border-border">
        <CopyButton code={code} />
        <Suspense
          fallback={
            <pre className="overflow-x-auto bg-transparent px-4 py-3 font-mono text-sm leading-4 text-foreground">
              <code className="text-foreground">{code}</code>
            </pre>
          }
        >
          <PrismCode
            code={code}
            language={match[1]}
            style={syntax.prism}
            showLineNumbers
            fontSize="0.75rem"
          />
        </Suspense>
      </div>
    )
  }

  // Unlabelled code blocks stay unhighlighted to keep the base chat chunk small.
  return (
    <div className="group/codeblock relative my-4 overflow-hidden rounded-lg border border-border">
      <CopyButton code={code} />
      <pre className="overflow-x-auto bg-transparent px-4 py-3 font-mono text-sm leading-4 text-foreground">
        <code className="text-foreground">{code}</code>
      </pre>
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
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.8125rem] text-foreground">
          {children}
        </code>
      )
    }
    return <CodeBlock className={className}>{children}</CodeBlock>
  },
  // ── Links ───────────────────────────────────────────────────────────────────
  // ── Headings ─────────────────────────────────────────────────────────────
  // Render all heading levels as h4 to keep the chat UI compact.
  h1: ({ children }) => <p>{children}</p>,
  h2: ({ children }) => <p>{children}</p>,
  h3: ({ children }) => <p>{children}</p>,
  h4: ({ children }) => <p>{children}</p>,
  h5: ({ children }) => <p>{children}</p>,
  h6: ({ children }) => <p>{children}</p>,

  // ── Bold ────────────────────────────────────────────────────────────────────
  strong: ({ children }) => <span>{children}</span>,

  // ── Horizontal rule ─────────────────────────────────────────────────────────
  hr: () => null,

  // ── Links ───────────────────────────────────────────────────────────────────
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-primary underline underline-offset-4 transition-colors hover:text-primary/70"
    >
      {children}
    </a>
  ),
}

