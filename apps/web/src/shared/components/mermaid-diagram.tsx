import { useEffect, useId, useMemo, useRef, useState } from "react"
import { Check, Code, Copy, Workflow } from "lucide-react"

import { useTheme } from "@/features/themes"
import { getMermaid } from "@/shared/lib/mermaid"
import { cn } from "@/shared/lib/utils"
import { Button } from "@/shared/ui/button"

/**
 * How long the source must hold still before we attempt a render.
 *
 * This is what makes the chat surface safe: while a message streams, `code`
 * changes on every token and the timer keeps resetting, so an incomplete
 * diagram is never parsed and its inevitable syntax error is never shown. Once
 * the stream stops the content settles and a genuinely broken diagram reports
 * itself normally.
 */
const RENDER_DEBOUNCE_MS = 250

/** True when a fenced code block's language is `mermaid`. */
export function isMermaidFence(className: string | undefined): boolean {
  return /(?:^|\s)language-mermaid(?:\s|$)/.test(className ?? "")
}

/**
 * True when a `pre` element wraps a mermaid fence, read off the hast node
 * react-markdown passes down.
 *
 * Surfaces that style `pre` themselves must unwrap it for diagrams — otherwise
 * the rendered SVG ends up inside a monospace code frame, complete with a
 * second border. The chat map already collapses `pre` to a fragment, so this is
 * only needed where `pre` is styled.
 */
export function isMermaidPre(node: unknown): boolean {
  if (typeof node !== "object" || node === null) return false
  const children = (node as { children?: unknown }).children
  if (!Array.isArray(children)) return false
  return children.some((child) => {
    if (typeof child !== "object" || child === null) return false
    const element = child as {
      tagName?: unknown
      properties?: { className?: unknown }
    }
    if (element.tagName !== "code") return false
    const className = element.properties?.className
    const names = Array.isArray(className) ? className : [className]
    return names.some((name) => name === "language-mermaid")
  })
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return typeof error === "string" ? error : "Failed to render diagram"
}

function CopySourceButton({ code }: { code: string }) {
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
      aria-label="Copy diagram source"
    >
      {copied ? <Check /> : <Copy />}
    </Button>
  )
}

/**
 * Renders a ```mermaid fence as a diagram, falling back to the raw source while
 * it loads, while it is still being written, or when it cannot be parsed.
 */
export function MermaidDiagram({
  code,
  className,
}: {
  code: string
  className?: string
}) {
  const { resolvedTheme, colorTheme, customData } = useTheme()
  const [svg, setSvg] = useState<string | null>(null)
  const [failure, setFailure] = useState<{
    code: string
    message: string
  } | null>(null)
  const [showSource, setShowSource] = useState(false)

  // Errors are tied to the exact source that produced them, so a change to
  // `code` retires the message by derivation rather than by a setState in the
  // effect below — the old text no longer describes what is on screen.
  const error = failure?.code === code ? failure.message : null

  // mermaid.render injects a temporary element keyed by this id, so it has to
  // be unique per instance and a valid CSS selector — useId's colons are not.
  const rawId = useId()
  const domId = useMemo(
    () => `mermaid-${rawId.replace(/[^a-zA-Z0-9]/g, "")}`,
    [rawId]
  )

  useEffect(() => {
    let cancelled = false

    const timer = setTimeout(() => {
      void (async () => {
        try {
          const mermaid = await getMermaid()
          await mermaid.parse(code)
          const rendered = await mermaid.render(domId, code)
          if (cancelled) return
          setSvg(rendered.svg)
          setFailure(null)
        } catch (caught) {
          if (cancelled) return
          setSvg(null)
          setFailure({ code, message: errorMessage(caught) })
        }
      })()
    }, RENDER_DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // `customData` is included by identity so live edits in the theme editor
    // re-render the diagram against the new palette.
  }, [code, domId, resolvedTheme, colorTheme, customData])

  const rendered = svg !== null && !showSource

  return (
    <div className={cn("not-prose group/mermaid relative my-3", className)}>
      <div className="absolute top-2 right-2 z-10 flex gap-1 opacity-0 transition-opacity group-hover/mermaid:opacity-100 focus-within:opacity-100">
        {svg !== null && (
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => setShowSource((value) => !value)}
            aria-label={rendered ? "Show diagram source" : "Show diagram"}
          >
            {rendered ? <Code /> : <Workflow />}
          </Button>
        )}
        <CopySourceButton code={code} />
      </div>

      {rendered ? (
        <div
          className="overflow-x-auto rounded-lg border border-border bg-card/40 p-3 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
          // mermaid sanitizes its own output under securityLevel: "strict".
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <>
          <pre className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-3 font-code text-xs leading-[1.45] text-foreground">
            <code>{code}</code>
          </pre>
          {error && (
            <p className="mt-1 font-code text-[0.6875rem] text-muted-foreground">
              Mermaid: {error}
            </p>
          )}
        </>
      )}
    </div>
  )
}
