/**
 * Prism viewer + LSP overlays: diagnostics gutter marks, hover tooltip,
 * cmd/ctrl-click go-to-definition.
 *
 * Wraps the existing PrismCode component so this is purely additive.
 */

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react"
import { Loader2 } from "lucide-react"
import { jellybeansdark, jellybeanslight } from "@/shared/lib/syntax-theme"
import { useTheme } from "@/shared/components/theme-provider"
import type {
  Diagnostic,
  Hover,
  Location,
  LocationLink,
  Position,
} from "../types"
import { LspConnection } from "../client"
import type { LineDecoration } from "@/features/chat/components/prism-code"

const PrismCode = lazy(() =>
  import("@/features/chat/components/prism-code").then((m) => ({ default: m.default })),
)

interface LspCodeViewerProps {
  code: string
  language: string
  fontSize?: string
  diagnostics: Diagnostic[]
  connection: LspConnection | null
  filePath: string | null
  onOpenFile?: (filePath: string, title: string, line?: number) => void
  /** External request to scroll to a given 1-indexed line (e.g. from problems strip). */
  scrollToLine?: number | null
}

interface HoverInfo {
  contents: string
  diagnostics: Diagnostic[]
  x: number
  y: number
}

const HOVER_DEBOUNCE_MS = 250

export function LspCodeViewer({
  code,
  language,
  fontSize = "0.75rem",
  diagnostics,
  connection,
  filePath,
  onOpenFile,
  scrollToLine,
}: LspCodeViewerProps) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"
  const containerRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<HoverInfo | null>(null)
  const hoverTimer = useRef<number | null>(null)
  const lastHoverPos = useRef<{ line: number; character: number } | null>(null)

  const lineDecorations = useMemo(() => {
    const map = new Map<number, LineDecoration[]>()
    for (const d of diagnostics) {
      const line = d.range.start.line + 1
      const existing = map.get(line) ?? []
      existing.push({
        severity: (d.severity ?? 1) as 1 | 2 | 3 | 4,
        message: d.message,
      })
      map.set(line, existing)
    }
    return map
  }, [diagnostics])

  // Scroll-to-line support
  useEffect(() => {
    if (!scrollToLine || !containerRef.current) return
    const el = containerRef.current.querySelector(
      `[data-line="${scrollToLine}"]`,
    ) as HTMLElement | null
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" })
      // Flash highlight
      const prev = el.style.backgroundColor
      el.style.backgroundColor = "rgba(250, 204, 21, 0.2)"
      setTimeout(() => {
        el.style.backgroundColor = prev
      }, 700)
    }
  }, [scrollToLine])

  // Inline squiggle underlines via CSS Custom Highlight API.
  // Unique per viewer instance so multiple open viewers don't stomp on each other.
  const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, "")
  const highlightNames = useMemo(
    () => ({
      error: `lsp-error-${instanceId}`,
      warning: `lsp-warning-${instanceId}`,
      info: `lsp-info-${instanceId}`,
    }),
    [instanceId],
  )

  useEffect(() => {
    const css = (globalThis as { CSS?: { highlights?: HighlightRegistry } }).CSS
    if (!css?.highlights || typeof Highlight === "undefined") return
    const root = containerRef.current
    if (!root) return

    const errorHl = new Highlight()
    const warningHl = new Highlight()
    const infoHl = new Highlight()

    for (const d of diagnostics) {
      const range = createCharRange(root, d.range)
      if (!range) continue
      const severity = d.severity ?? 1
      if (severity === 1) errorHl.add(range)
      else if (severity === 2) warningHl.add(range)
      else infoHl.add(range)
    }

    css.highlights.set(highlightNames.error, errorHl)
    css.highlights.set(highlightNames.warning, warningHl)
    css.highlights.set(highlightNames.info, infoHl)

    return () => {
      css.highlights?.delete(highlightNames.error)
      css.highlights?.delete(highlightNames.warning)
      css.highlights?.delete(highlightNames.info)
    }
    // `code` is in deps so we re-attach after Prism (re-)renders the lines.
  }, [diagnostics, highlightNames, code])

  /** Resolve (x, y) → (line, character) by walking the DOM. Returns null if outside code. */
  const resolvePosition = useCallback((clientX: number, clientY: number): Position | null => {
    const root = containerRef.current
    if (!root) return null
    const target = document.elementFromPoint(clientX, clientY)
    if (!target || !(target instanceof Node) || !root.contains(target)) return null
    const lineEl = (target as Element).closest?.("[data-line]") as HTMLElement | null
    if (!lineEl) return null
    const lineNumber = Number(lineEl.getAttribute("data-line"))
    if (!Number.isFinite(lineNumber) || lineNumber <= 0) return null

    // Resolve a caret position in the line.
    // caretRangeFromPoint is Chromium-only but Electron is Chromium, so we're fine.
    type CaretFn = (x: number, y: number) => Range | null
    const caretFn = (document as unknown as { caretRangeFromPoint?: CaretFn }).caretRangeFromPoint
    if (!caretFn) return { line: lineNumber - 1, character: 0 }
    const range = caretFn.call(document, clientX, clientY)
    if (!range) return { line: lineNumber - 1, character: 0 }
    if (!lineEl.contains(range.startContainer)) {
      return { line: lineNumber - 1, character: 0 }
    }
    const measureRange = document.createRange()
    // Start measurement after the line-number span (if any) so the count
    // reflects code characters only.
    const lineNumberEl = lineEl.querySelector(
      ".linenumber, .react-syntax-highlighter-line-number",
    ) as Element | null
    if (lineNumberEl?.parentNode) {
      const parent = lineNumberEl.parentNode
      const idx = Array.from(parent.childNodes).indexOf(lineNumberEl as ChildNode) + 1
      measureRange.setStart(parent, idx)
    } else {
      measureRange.setStart(lineEl, 0)
    }
    measureRange.setEnd(range.startContainer, range.startOffset)
    const character = measureRange.toString().length
    measureRange.detach?.()
    return { line: lineNumber - 1, character }
  }, [])

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!connection || !filePath) return
      const pos = resolvePosition(e.clientX, e.clientY)
      if (!pos) {
        if (hoverTimer.current) clearTimeout(hoverTimer.current)
        hoverTimer.current = window.setTimeout(() => setHover(null), 100)
        return
      }
      const prev = lastHoverPos.current
      if (prev && prev.line === pos.line && prev.character === pos.character) return
      lastHoverPos.current = pos
      if (hoverTimer.current) clearTimeout(hoverTimer.current)
      const x = e.clientX
      const y = e.clientY

      // Diagnostics overlapping this position — show them right away.
      const matchingDiags = diagnostics.filter((d) => positionInRange(pos, d.range))
      if (matchingDiags.length > 0) {
        setHover({ contents: "", diagnostics: matchingDiags, x, y })
      }

      hoverTimer.current = window.setTimeout(() => {
        void connection
          .hover(filePath, pos)
          .then((result) => {
            const text = flattenHover(result)
            if (!text && matchingDiags.length === 0) {
              setHover(null)
              return
            }
            setHover({ contents: text, diagnostics: matchingDiags, x, y })
          })
          .catch(() => {
            if (matchingDiags.length === 0) setHover(null)
          })
      }, HOVER_DEBOUNCE_MS)
    },
    [connection, filePath, resolvePosition, diagnostics],
  )

  const handlePointerLeave = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    setHover(null)
    lastHoverPos.current = null
  }, [])

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!connection || !filePath || !(e.metaKey || e.ctrlKey)) return
      const pos = resolvePosition(e.clientX, e.clientY)
      if (!pos) return
      e.preventDefault()
      void connection.definition(filePath, pos).then((result) => {
        const target = pickFirstLocation(result)
        if (!target) return
        if (target.filePath === filePath) {
          const lineEl = containerRef.current?.querySelector(
            `[data-line="${target.line + 1}"]`,
          ) as HTMLElement | null
          lineEl?.scrollIntoView({ behavior: "smooth", block: "center" })
        } else if (onOpenFile) {
          const name = target.filePath.split(/[/\\]/).pop() ?? target.filePath
          onOpenFile(target.filePath, name, target.line + 1)
        }
      })
    },
    [connection, filePath, onOpenFile, resolvePosition],
  )

  useEffect(() => {
    return () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current)
    }
  }, [])

  const tooltipStyle: CSSProperties | undefined = hover
    ? {
        position: "fixed",
        left: Math.min(hover.x + 12, window.innerWidth - 360),
        top: Math.min(hover.y + 18, window.innerHeight - 200),
        maxWidth: 360,
        zIndex: 50,
      }
    : undefined

  // Inject squiggle CSS rules for this viewer's unique highlight names.
  const squiggleCss = useMemo(
    () => `
      ::highlight(${highlightNames.error}) {
        text-decoration: underline wavy hsl(0, 80%, 60%);
        text-decoration-skip-ink: none;
      }
      ::highlight(${highlightNames.warning}) {
        text-decoration: underline wavy hsl(45, 90%, 55%);
        text-decoration-skip-ink: none;
      }
      ::highlight(${highlightNames.info}) {
        text-decoration: underline wavy hsl(210, 80%, 60%);
        text-decoration-skip-ink: none;
      }
    `,
    [highlightNames],
  )

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onClick={handleClick}
      className="relative h-full"
    >
      <style>{squiggleCss}</style>
      <Suspense
        fallback={
          <div className="flex items-center gap-2 px-4 py-4 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            Loading…
          </div>
        }
      >
        <PrismCode
          code={code}
          language={language}
          style={isDark ? jellybeansdark : jellybeanslight}
          showLineNumbers
          fontSize={fontSize}
          lineDecorations={lineDecorations}
          enableLineDataAttrs
        />
      </Suspense>
      {hover && (
        <div
          style={tooltipStyle}
          className="pointer-events-none rounded border bg-popover text-xs text-popover-foreground shadow-md"
        >
          {hover.diagnostics.length > 0 && (
            <ul className="space-y-1 px-2 py-1.5">
              {hover.diagnostics.map((d, i) => {
                const severity = d.severity ?? 1
                return (
                  <li
                    key={i}
                    className={
                      severity === 1
                        ? "text-destructive"
                        : severity === 2
                          ? "text-amber-500"
                          : severity === 3
                            ? "text-blue-400"
                            : "text-muted-foreground"
                    }
                  >
                    <span className="text-[11px] leading-relaxed">{d.message}</span>
                    {(d.source || d.code !== undefined) && (
                      <span className="ml-2 text-[10px] opacity-60">
                        {d.source ?? ""}
                        {d.code !== undefined ? `(${d.code})` : ""}
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          {hover.contents && (
            <>
              {hover.diagnostics.length > 0 && <div className="border-t" />}
              <pre className="whitespace-pre-wrap px-2 py-1.5 font-mono text-[11px] leading-relaxed">
                {hover.contents}
              </pre>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Build a DOM Range that covers the LSP range inside the rendered code, by
 * walking text nodes in the affected line element(s) and counting characters.
 * Handles single-line and multi-line ranges.
 */
function createCharRange(
  root: Element,
  lspRange: { start: { line: number; character: number }; end: { line: number; character: number } },
): Range | null {
  const startLine = root.querySelector(`[data-line="${lspRange.start.line + 1}"]`)
  if (!startLine) return null

  if (lspRange.start.line === lspRange.end.line) {
    return createRangeFromCharOffsets(
      startLine,
      lspRange.start.character,
      lspRange.end.character,
    )
  }

  // Multi-line: span from start char on start line through end char on end line.
  const endLine = root.querySelector(`[data-line="${lspRange.end.line + 1}"]`)
  if (!endLine) {
    const lineLen = (startLine.textContent ?? "").length
    return createRangeFromCharOffsets(startLine, lspRange.start.character, lineLen)
  }
  const startAnchor = findTextNodeAt(startLine, lspRange.start.character)
  const endAnchor = findTextNodeAt(endLine, lspRange.end.character)
  if (!startAnchor || !endAnchor) return null
  const range = document.createRange()
  range.setStart(startAnchor.node, startAnchor.offset)
  range.setEnd(endAnchor.node, endAnchor.offset)
  return range
}

function createRangeFromCharOffsets(
  lineEl: Element,
  startChar: number,
  endChar: number,
): Range | null {
  const start = findTextNodeAt(lineEl, startChar)
  const end = findTextNodeAt(lineEl, Math.max(endChar, startChar + 1))
  if (!start || !end) return null
  const range = document.createRange()
  range.setStart(start.node, start.offset)
  range.setEnd(end.node, end.offset)
  return range
}

/** Find the text node containing the Nth character of CODE in the element. */
function findTextNodeAt(
  container: Element,
  charOffset: number,
): { node: Node; offset: number } | null {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      isInsideLineNumber(n) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  })
  let consumed = 0
  let node = walker.nextNode()
  let lastNode: Node | null = null
  let lastLen = 0
  while (node) {
    const len = (node.textContent ?? "").length
    if (consumed + len >= charOffset) {
      return { node, offset: charOffset - consumed }
    }
    consumed += len
    lastNode = node
    lastLen = len
    node = walker.nextNode()
  }
  if (lastNode) return { node: lastNode, offset: lastLen }
  return null
}

/**
 * react-syntax-highlighter renders the line-number span *inside* the line
 * wrapper (class "linenumber"). Skip its text content when counting code
 * character offsets, otherwise the count is shifted by the line number's
 * digit count.
 */
function isInsideLineNumber(node: Node): boolean {
  let cursor: Node | null = node
  while (cursor && cursor.nodeType !== Node.DOCUMENT_NODE) {
    if (
      cursor instanceof Element &&
      (cursor.classList.contains("linenumber") ||
        cursor.classList.contains("react-syntax-highlighter-line-number"))
    ) {
      return true
    }
    cursor = cursor.parentNode
  }
  return false
}

function flattenHover(hover: Hover | null | undefined): string {
  if (!hover) return ""
  const c = hover.contents
  if (typeof c === "string") return c
  if (Array.isArray(c)) {
    return c
      .map((item) => (typeof item === "string" ? item : item.value))
      .filter(Boolean)
      .join("\n\n")
      .trim()
  }
  if (c && typeof c === "object" && "value" in c) return c.value.trim()
  return ""
}

function pickFirstLocation(
  result: Location | Location[] | LocationLink[] | null,
): { filePath: string; line: number; character: number } | null {
  if (!result) return null
  const arr = Array.isArray(result) ? result : [result]
  if (arr.length === 0) return null
  const first = arr[0]
  // LocationLink
  if ("targetUri" in first) {
    const range = first.targetSelectionRange ?? first.targetRange
    return {
      filePath: uriToFilePath(first.targetUri),
      line: range.start.line,
      character: range.start.character,
    }
  }
  return {
    filePath: uriToFilePath(first.uri),
    line: first.range.start.line,
    character: first.range.start.character,
  }
}

function uriToFilePath(uri: string): string {
  if (uri.startsWith("file://")) {
    return decodeURIComponent(uri.slice("file://".length))
  }
  return uri
}

function positionInRange(
  pos: Position,
  range: { start: Position; end: Position },
): boolean {
  if (pos.line < range.start.line || pos.line > range.end.line) return false
  if (pos.line === range.start.line && pos.character < range.start.character) return false
  if (pos.line === range.end.line && pos.character > range.end.character) return false
  return true
}
