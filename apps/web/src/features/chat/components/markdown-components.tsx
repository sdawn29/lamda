import { lazy, Suspense, useEffect, useRef, useState } from "react"
import type { Components } from "react-markdown"
import { Icon } from "@iconify/react"
import { useSyntaxTheme } from "@/features/themes"
import { useMainTabsStore } from "@/features/main-tabs"
import { Check, Copy } from "lucide-react"

import { Button } from "@/shared/ui/button"
import { getIconName } from "@/shared/ui/file-icon"
import { SectionLabel } from "@/shared/ui/section-label"
import { MessageChip } from "./message-chip"

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
            <pre className="overflow-x-auto bg-transparent px-4 py-3 font-code text-sm leading-4 text-foreground">
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
      <pre className="overflow-x-auto bg-transparent px-4 py-3 font-code text-sm leading-4 text-foreground">
        <code className="text-foreground">{code}</code>
      </pre>
    </div>
  )
}

// File extensions we consider "pathish" even without a leading slash, so a
// bare `markdown-components.tsx` still becomes clickable.
const FILE_EXT_RE =
  /\.(tsx?|jsx?|mjs|cjs|json|md|mdx|css|scss|less|html?|py|go|rs|rb|java|kt|swift|c|h|cpp|hpp|cs|php|sh|bash|zsh|sql|ya?ml|toml|ini|env|lock|txt|svg|vue|astro)$/i

// Trailing `:line` or `:line:col` location suffix.
const LINE_SUFFIX_RE = /:(\d+)(?::\d+)?$/

interface FileReference {
  path: string
  line?: number
}

/**
 * Decide whether an inline-code span is a navigable file reference. Conservative
 * on purpose: only paths (a `/`) or bare filenames with a known extension count,
 * so shell snippets like `npm install` or identifiers like `useState` stay plain.
 */
function parseFileReference(text: string): FileReference | null {
  const trimmed = text.trim()
  if (!trimmed || /\s/.test(trimmed)) return null
  if (/^[a-z]+:\/\//i.test(trimmed)) return null // URLs (http://, file://, …)

  const lineMatch = trimmed.match(LINE_SUFFIX_RE)
  const line = lineMatch ? Number(lineMatch[1]) : undefined
  const path = lineMatch ? trimmed.slice(0, lineMatch.index) : trimmed
  if (!path) return null

  const looksLikePath = path.includes("/") || FILE_EXT_RE.test(path)
  if (!looksLikePath) return null

  return { path, line }
}

function resolveAbsolutePath(path: string, rootPath?: string): string {
  if (path.startsWith("/")) return path
  if (rootPath) return `${rootPath.replace(/\/$/, "")}/${path}`
  return path
}

function FileReferenceLink({
  reference,
  rootPath,
}: {
  reference: FileReference
  rootPath?: string
}) {
  const basename = reference.path.split("/").pop() || reference.path

  function handleClick() {
    useMainTabsStore.getState().addFileTab({
      filePath: resolveAbsolutePath(reference.path, rootPath),
      title: basename,
      workspacePath: rootPath,
      scrollToLine: reference.line,
    })
  }

  return (
    <MessageChip
      onClick={handleClick}
      icon={
        <Icon
          icon={`catppuccin:${getIconName(basename)}`}
          data-icon="inline-start"
          aria-hidden
        />
      }
      label={basename}
      meta={reference.line != null ? `:${reference.line}` : undefined}
      detail={
        <div className="flex flex-col gap-1">
          <SectionLabel>Open in review panel</SectionLabel>
          <span className="font-mono text-xs break-all">
            {reference.path}
            {reference.line != null ? `:${reference.line}` : ""}
          </span>
        </div>
      }
    />
  )
}

export function getMarkdownComponents(rootPath?: string): Components {
  const cached = markdownComponentsCache.get(rootPath)
  if (cached) return cached
  const components = createMarkdownComponents(rootPath)
  markdownComponentsCache.set(rootPath, components)
  return components
}

const markdownComponentsCache = new Map<string | undefined, Components>()

function createMarkdownComponents(rootPath?: string): Components {
  return {
    ...markdownComponents,
    code: ({ className, children }) => {
      const isBlock =
        String(children).endsWith("\n") || className?.startsWith("language-")
      if (!isBlock) {
        const text = String(children)
        const reference = parseFileReference(text)
        if (reference) {
          return <FileReferenceLink reference={reference} rootPath={rootPath} />
        }
        return (
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.8125rem] text-foreground">
            {children}
          </code>
        )
      }
      return <CodeBlock className={className}>{children}</CodeBlock>
    },
  }
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

