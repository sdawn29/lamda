import { lazy, Suspense, useEffect, useRef, useState } from "react"
import type { Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import type { PluggableList } from "unified"
import { Icon } from "@iconify/react"
import { useSyntaxTheme } from "@/features/themes"
import { useMainTabsStore } from "@/features/main-tabs"
import { Check, Copy } from "lucide-react"

import { cn } from "@/shared/lib/utils"
import { Button } from "@/shared/ui/button"
import { getIconName } from "@/shared/ui/file-icon"
import { SectionLabel } from "@/shared/ui/section-label"
import { MessageChip } from "./message-chip"

const PrismCode = lazy(() => import("./prism-code"))

/** Shared remark plugin list — hoisted so every markdown surface passes the
 * same stable reference instead of allocating a new array each render. */
export const remarkPlugins: PluggableList = [remarkGfm]

/**
 * Shared base for both prose variants below: sizing, font, and link styling
 * that never differ between compact and rich chat rendering.
 */
const CHAT_PROSE_BASE =
  "prose prose-sm max-w-none dark:prose-invert font-chat " +
  "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_a]:transition-colors [&_a:hover]:text-primary/70"

/**
 * Single source of truth for chat-surface markdown typography, shared by the
 * assistant message body and the (dimmed) thinking block so their font, leading,
 * and block spacing stay identical. Code-block sizing lives in CodeBlock below.
 */
export const chatProseClass =
  CHAT_PROSE_BASE +
  " prose-headings:text-foreground prose-headings:text-sm prose-headings:leading-snug prose-headings:my-0 " +
  "prose-p:leading-[1.5] prose-p:mt-0 prose-p:mb-[0.5em] " +
  "prose-ul:my-0 prose-ol:my-0 prose-li:my-0 prose-blockquote:my-0 " +
  "[&_li]:text-sm [&_li]:leading-[1.5] [&_li>p]:my-0 " +
  "[&>*+*]:mt-1 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"

/**
 * Rich variant of {@link chatProseClass}: keeps the chat font but restores the
 * full markdown hierarchy — sized headings, bold weight, horizontal rules, and
 * blockquotes — for users who opt into rich rendering in Chat settings.
 */
export const chatProseClassRich =
  CHAT_PROSE_BASE +
  " prose-headings:text-foreground prose-headings:font-semibold prose-headings:leading-tight " +
  "prose-h1:text-xl prose-h2:text-lg prose-h3:text-base prose-h4:text-[0.95rem] prose-h5:text-sm prose-h6:text-[0.8125rem] " +
  "prose-p:leading-normal " +
  "prose-strong:text-foreground prose-strong:font-semibold " +
  "prose-em:italic prose-em:text-foreground " +
  "prose-hr:my-3 prose-hr:border-border " +
  "prose-blockquote:border-l-2 prose-blockquote:border-border prose-blockquote:font-normal prose-blockquote:text-muted-foreground " +
  "prose-ul:list-disc prose-ol:list-decimal prose-li:my-0.5 prose-li:leading-normal prose-li:marker:text-muted-foreground " +
  "[&_li>p]:my-0 [&_li>p]:leading-normal " +
  "[&_.contains-task-list]:list-none [&_.contains-task-list]:pl-0 " +
  "[&_.task-list-item]:my-0.5 [&_.task-list-item]:list-none [&_.task-list-item]:pl-0 " +
  "[&_del]:text-muted-foreground [&_del]:line-through " +
  "[&_mark]:rounded [&_mark]:bg-primary/20 [&_mark]:px-0.5 [&_mark]:text-foreground " +
  "[&_sub]:align-sub [&_sub]:text-[0.75em] [&_sup]:align-super [&_sup]:text-[0.75em] " +
  "[&_kbd]:rounded [&_kbd]:border [&_kbd]:border-border [&_kbd]:bg-muted [&_kbd]:px-1 [&_kbd]:font-mono [&_kbd]:text-[0.75em]"

/**
 * Inline `code` span styling, shared by both component maps below.
 * `inline-block` + `align-middle` so the vertical padding is reserved in the
 * line box instead of painting outside it. `leading-none` pins the chip's own
 * height (font-size + padding only) well under the surrounding text's
 * line-height (21px at leading-1.5/text-sm), so it always fits inside the
 * existing line rhythm rather than depending on the line growing to fit it —
 * that's what kept wrapped code chips (e.g. a list item whose inline code
 * spills onto a second line) sitting flush against the line above.
 */
const INLINE_CODE_CLASS =
  "inline-block rounded bg-muted px-1.5 py-0.5 align-middle font-mono text-[0.8125rem] leading-none text-foreground"

/** Fenced/indented code blocks render at 12px to match the Prism highlighter. */
const CODE_BLOCK_PRE_CLASS =
  "overflow-x-auto bg-transparent px-3 py-2.5 font-code text-xs leading-normal text-foreground"

/** Wrapper margin shared by highlighted and plain code blocks. */
const CODE_BLOCK_WRAPPER_CLASS =
  "group/codeblock relative my-2.5 overflow-hidden rounded-lg border border-border"

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

/**
 * GFM task-list checkbox (`- [ ]` / `- [x]`), restyled to match the app design
 * system instead of the native browser control: a small rounded box that fills
 * with the primary accent and a check glyph when done, mirroring the todo panel.
 */
function TaskCheckbox({ checked }: { checked?: boolean }) {
  return (
    <span
      className={cn(
        "mt-[0.2em] inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] border transition-colors",
        checked
          ? "border-primary bg-primary text-primary-foreground"
          : "border-muted-foreground/40 bg-transparent"
      )}
      aria-hidden
    >
      {checked ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : null}
    </span>
  )
}

// react-markdown v9+ removed the `inline` prop. The reliable heuristic: remark
// always appends a trailing "\n" to fenced/indented code block content, but
// never to inline code spans.
function isCodeBlock(className: string | undefined, children: React.ReactNode) {
  return String(children).endsWith("\n") || !!className?.startsWith("language-")
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
      <div className={CODE_BLOCK_WRAPPER_CLASS}>
        <CopyButton code={code} />
        <Suspense
          fallback={
            <pre className={CODE_BLOCK_PRE_CLASS}>
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
    <div className={CODE_BLOCK_WRAPPER_CLASS}>
      <CopyButton code={code} />
      <pre className={CODE_BLOCK_PRE_CLASS}>
        <code className="text-foreground">{code}</code>
      </pre>
    </div>
  )
}

// File extensions we consider "pathish" even without a leading slash, so a
// bare `markdown-components.tsx` still becomes clickable.
const FILE_EXT_RE =
  /\.(tsx?|jsx?|mjs|cjs|json|md|mdx|css|scss|less|html?|py|go|rs|rb|java|kt|swift|c|h|cpp|hpp|cs|php|sh|bash|zsh|sql|ya?ml|toml|ini|env|lock|txt|svg|vue|astro)$/i

// Trailing location suffix: `:line`, `:line:col`, or a range like `:8-9` /
// `:8:1-9:5`. The first capture group is the start line (used to scroll), while
// the whole match preserves the original text (range included) for display.
const LINE_SUFFIX_RE = /:(\d+)(?::\d+)?(?:-\d+(?::\d+)?)?$/

// API/web routes masquerade as folder paths: they have slashes and no file
// extension, so the directory heuristic happily turns `/api/users` into a
// folder chip. These patterns flag a string as a route so we leave it as plain
// inline code instead.

// A segment that begins with a route-param sigil: `/users/:id`,
// `/repos/{owner}/{repo}`, `/items/<id>`.
const ROUTE_PARAM_RE = /\/(?::|\{|<)/

// A leading-slash path whose first segment is a well-known API/web prefix.
// Anchored to a leading slash so relative folders like `api/handlers` or
// `v8/snapshot` are still treated as paths.
const ROUTE_PREFIX_RE =
  /^\/(?:api|v\d+|graphql|gql|oauth2?|webhooks?)(?:\/|$)/i

// Query string or fragment — only ever appears in URLs/routes, never in a path
// we could open in the editor.
const ROUTE_QUERY_RE = /[?#]/

function looksLikeApiRoute(path: string): boolean {
  return (
    ROUTE_PARAM_RE.test(path) ||
    ROUTE_PREFIX_RE.test(path) ||
    ROUTE_QUERY_RE.test(path)
  )
}

interface FileReference {
  path: string
  /** Start line, used to scroll the opened file into view. */
  line?: number
  /** Full location suffix without the leading colon (e.g. `8`, `8:3`, `8-9`). */
  location?: string
}

/**
 * A reference points at a directory when it ends in a slash, or when its
 * basename has no file extension. Only files get chips, so directory-shaped
 * references stay as plain inline code.
 */
function looksLikeDirectory(path: string): boolean {
  if (path.endsWith("/")) return true
  const basename = path.replace(/\/+$/, "").split("/").pop() ?? path
  // Dotfiles (.npmrc, .env, .gitignore) start with a dot — always a file.
  if (basename.startsWith(".")) return false
  return basename.lastIndexOf(".") <= 0
}

/**
 * Decide whether an inline-code span is a navigable file reference. Conservative
 * on purpose: only paths (a `/`) or bare filenames with a known extension count,
 * so shell snippets like `npm install` or identifiers like `useState` stay plain.
 * Directories never qualify — chips are for openable files only.
 */
function parseFileReference(text: string): FileReference | null {
  const trimmed = text.trim()
  if (!trimmed || /\s/.test(trimmed)) return null
  if (/^[a-z]+:\/\//i.test(trimmed)) return null // URLs (http://, file://, …)

  const lineMatch = trimmed.match(LINE_SUFFIX_RE)
  const line = lineMatch ? Number(lineMatch[1]) : undefined
  const location = lineMatch ? lineMatch[0].slice(1) : undefined
  const path = lineMatch ? trimmed.slice(0, lineMatch.index) : trimmed
  if (!path) return null

  const hasExtension = FILE_EXT_RE.test(path)

  // A real file extension (`route.ts`, `schema.json`) wins even if the path also
  // looks route-ish; otherwise route-shaped strings stay as plain inline code.
  if (!hasExtension && looksLikeApiRoute(path)) return null

  const looksLikePath = path.includes("/") || hasExtension
  if (!looksLikePath) return null

  // Folders aren't openable, so they stay as plain inline code (no chip).
  if (looksLikeDirectory(path)) return null

  return { path, line, location }
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
  const normalizedPath = reference.path.replace(/\/+$/, "")
  const basename = normalizedPath.split("/").pop() || normalizedPath

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
      meta={reference.location != null ? `:${reference.location}` : undefined}
      detail={
        <div className="flex flex-col gap-1">
          <SectionLabel>Open in review panel</SectionLabel>
          <span className="font-mono text-xs break-all">
            {reference.path}
            {reference.location != null ? `:${reference.location}` : ""}
          </span>
        </div>
      }
    />
  )
}

/**
 * Resolve the component map for the assistant message body. `rich` keeps the
 * full markdown hierarchy (headings, bold, rules); the default compact map
 * flattens it. Both share table/code/link styling and the file-reference chip.
 */
export function getMarkdownComponents(
  rootPath?: string,
  rich = false
): Components {
  const cacheKey = `${rich ? "rich" : "compact"}:${rootPath ?? ""}`
  const cached = markdownComponentsCache.get(cacheKey)
  if (cached) return cached
  const components = createMarkdownComponents(rootPath, rich)
  markdownComponentsCache.set(cacheKey, components)
  return components
}

const markdownComponentsCache = new Map<string, Components>()

function createMarkdownComponents(rootPath?: string, rich = false): Components {
  return {
    ...(rich ? baseMarkdownComponents : markdownComponents),
    code: ({ className, children }) => {
      if (isCodeBlock(className, children)) {
        return <CodeBlock className={className}>{children}</CodeBlock>
      }
      const reference = parseFileReference(String(children))
      if (reference) {
        return <FileReferenceLink reference={reference} rootPath={rootPath} />
      }
      return <code className={INLINE_CODE_CLASS}>{children}</code>
    },
  }
}

/**
 * Tables, code, and links — shared by both the compact and rich component maps.
 * Headings, bold, and rules are left to the renderer/prose defaults here; the
 * compact map below overrides them to flatten the hierarchy.
 */
const baseMarkdownComponents: Components = {
  // ── Tables ──────────────────────────────────────────────────────────────────
  table: ({ children }) => (
    <div className="not-prose my-1.5 overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted/50">{children}</thead>,
  th: ({ children }) => (
    <th className="border-b border-border px-3 py-1.5 text-left font-medium">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-border/50 px-3 py-1.5 last:border-0">
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
  code: ({ className, children }) =>
    isCodeBlock(className, children) ? (
      <CodeBlock className={className}>{children}</CodeBlock>
    ) : (
      <code className={INLINE_CODE_CLASS}>{children}</code>
    ),
  // ── Task lists ──────────────────────────────────────────────────────────────
  // remark-gfm tags task items with `task-list-item` and renders a disabled
  // <input type="checkbox">. We lay the row out as checkbox + text and swap the
  // native control for the design-system TaskCheckbox.
  li: ({ className, children, ...props }) => {
    if (className?.includes("task-list-item")) {
      return (
        <li className={cn(className, "flex items-start gap-2")}>{children}</li>
      )
    }
    return (
      <li className={className} {...props}>
        {children}
      </li>
    )
  },
  input: ({ type, checked }) =>
    type === "checkbox" ? <TaskCheckbox checked={checked} /> : null,
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

/**
 * Default (compact) component map: flattens the markdown hierarchy on top of the
 * shared base so the chat surface stays dense — every heading becomes a
 * paragraph, bold loses its weight, and horizontal rules are dropped. The rich
 * variant skips these overrides and uses {@link baseMarkdownComponents} directly.
 */
export const markdownComponents: Components = {
  ...baseMarkdownComponents,
  // ── Headings ─────────────────────────────────────────────────────────────
  // Render all heading levels as paragraphs to keep the chat UI compact.
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
}
