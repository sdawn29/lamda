import { useEffect, useMemo, useState, useCallback, useRef, memo } from "react"
import { Check, Loader2, MessageSquarePlus } from "lucide-react"
import { Alert, AlertDescription } from "@/shared/ui/alert"
import { Button } from "@/shared/ui/button"
import { FileHeader } from "@/features/git/components/file-header"
import { useElectronPlatform, useOpenWithApps } from "@/features/electron"
import { appendToken, getServerUrl } from "@/shared/lib/client"
import { cn } from "@/shared/lib/utils"
import { LANGUAGE_MAP } from "@/shared/lib/language-map"
import {
  MonacoCodeViewer,
  ProblemsStrip,
  useFileDiagnostics,
  useLspConnection,
  useOpenDocument,
  useResolveWorkspaceId,
} from "@/features/lsp"
import { useChatActions } from "@/features/chat/contexts/chat-actions-context"
import { subscribeToWorkspaceFileUpdates } from "@/features/chat/thread-status-store"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { Plugin } from "unified"
import type { Element, Root } from "hast"

const MIN_SCALE = 1
const MAX_SCALE = 8

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

function normalizeSelectionText(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

type SelectionRange = {
  line: number
  startColumn?: number
  endLine?: number
  endColumn?: number
}

function sourcePositionToIndex(
  source: string,
  line: number,
  column: number
): number {
  let index = 0
  for (let currentLine = 1; currentLine < line; currentLine++) {
    const newlineIndex = source.indexOf("\n", index)
    if (newlineIndex === -1) return source.length
    index = newlineIndex + 1
  }
  return Math.min(source.length, index + Math.max(0, column - 1))
}

function rangeFromSourceIndex(
  source: string,
  startIndex: number,
  selectedText: string
): SelectionRange {
  const beforeSelection = source.slice(0, startIndex)
  const selectionSource = source.slice(
    startIndex,
    startIndex + selectedText.length
  )
  const line = beforeSelection.split(/\r\n|\r|\n/).length
  const beforeLineStart = beforeSelection.match(/[^\r\n]*$/)?.[0] ?? ""
  const selectedLines = selectionSource.split(/\r\n|\r|\n/)
  const startColumn = beforeLineStart.length + 1
  const endLine = line + selectedLines.length - 1
  const endColumn =
    selectedLines.length === 1
      ? startColumn + selectedLines[0].length - 1
      : Math.max(1, selectedLines[selectedLines.length - 1].length)
  return { line, startColumn, endLine, endColumn }
}

const rehypeSourcePositions: Plugin<[], Root> = () => {
  return (tree) => {
    const visit = (node: Root | Root["children"][number]) => {
      if (node.type === "element" && node.position) {
        const element = node as Element
        element.properties ??= {}
        element.properties.dataSourceStartLine = String(node.position.start.line)
        element.properties.dataSourceStartColumn = String(
          node.position.start.column
        )
        element.properties.dataSourceEndLine = String(node.position.end.line)
        element.properties.dataSourceEndColumn = String(node.position.end.column)
      }
      if ("children" in node) {
        for (const child of node.children) visit(child)
      }
    }

    visit(tree)
  }
}

function findSelectionLineRangeFromSource(
  source: string,
  selectedText: string
): SelectionRange {
  const exactIndex = source.indexOf(selectedText)
  if (exactIndex >= 0) {
    return rangeFromSourceIndex(source, exactIndex, selectedText)
  }

  const selected = normalizeSelectionText(selectedText)
  if (!selected) return { line: 1 }

  const lines = source.split(/\r\n|\r|\n/)
  for (let start = 0; start < lines.length; start++) {
    let windowText = ""
    for (let end = start; end < Math.min(lines.length, start + 80); end++) {
      windowText = windowText
        ? `${windowText}\n${lines[end]}`
        : lines[end]
      if (normalizeSelectionText(windowText).includes(selected)) {
        const line = start + 1
        const endLine = end + 1
        return endLine === line ? { line } : { line, endLine }
      }
    }
  }

  return { line: 1 }
}

function getSourcePositionElement(node: Node | null): HTMLElement | null {
  const element =
    node instanceof HTMLElement ? node : node?.parentElement ?? null
  return element?.closest<HTMLElement>("[data-source-start-line]") ?? null
}

function readSourcePosition(element: HTMLElement | null): SelectionRange | null {
  if (!element) return null
  const line = Number(element.dataset.sourceStartLine)
  const startColumn = Number(element.dataset.sourceStartColumn)
  const endLine = Number(element.dataset.sourceEndLine)
  const endColumn = Number(element.dataset.sourceEndColumn)
  if (!line || !endLine) return null
  return {
    line,
    startColumn: startColumn || undefined,
    endLine,
    endColumn: endColumn ? Math.max(1, endColumn - 1) : undefined,
  }
}

function findSelectionRangeInElementSource(
  source: string,
  selectedText: string,
  element: HTMLElement | null
): SelectionRange | null {
  const position = readSourcePosition(element)
  if (!position?.startColumn) return null

  const startIndex = sourcePositionToIndex(
    source,
    position.line,
    position.startColumn
  )
  const endIndex = sourcePositionToIndex(
    source,
    position.endLine ?? position.line,
    (position.endColumn ?? position.startColumn) + 1
  )
  const localSource = source.slice(startIndex, endIndex)
  const localIndex = localSource.indexOf(selectedText)
  if (localIndex === -1) return null

  return rangeFromSourceIndex(source, startIndex + localIndex, selectedText)
}

function findSelectionLineRange(
  source: string,
  selectedText: string,
  domRange: Range
): SelectionRange {
  const commonElement = getSourcePositionElement(domRange.commonAncestorContainer)
  const preciseRange = findSelectionRangeInElementSource(
    source,
    selectedText,
    commonElement
  )
  if (preciseRange) return preciseRange

  const start = readSourcePosition(
    getSourcePositionElement(domRange.startContainer)
  )
  const end = readSourcePosition(getSourcePositionElement(domRange.endContainer))

  if (start && end) {
    return {
      line: Math.min(start.line, end.line),
      startColumn: start.startColumn,
      endLine: Math.max(start.endLine ?? start.line, end.endLine ?? end.line),
      endColumn: end.endColumn,
    }
  }

  return findSelectionLineRangeFromSource(source, selectedText)
}

function MarkdownSelectionActions({
  children,
  content,
  contextPath,
}: {
  children: React.ReactNode
  content: string
  contextPath: string
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const chatActions = useChatActions()
  const [selection, setSelection] = useState<{
    text: string
    range: SelectionRange
    top: number
    left: number
  } | null>(null)

  const updateSelection = useCallback(() => {
    if (!chatActions) {
      setSelection(null)
      return
    }

    const root = rootRef.current
    const windowSelection = window.getSelection()
    if (
      !root ||
      !windowSelection ||
      windowSelection.isCollapsed ||
      windowSelection.rangeCount === 0
    ) {
      setSelection(null)
      return
    }

    const anchorNode = windowSelection.anchorNode
    const focusNode = windowSelection.focusNode
    if (
      !anchorNode ||
      !focusNode ||
      !root.contains(anchorNode) ||
      !root.contains(focusNode)
    ) {
      setSelection(null)
      return
    }

    const text = windowSelection.toString().trim()
    if (!text) {
      setSelection(null)
      return
    }
    const range = windowSelection.getRangeAt(0)
    const selectionRange = findSelectionLineRange(content, text, range)
    const rects = Array.from(range.getClientRects()).filter(
      (rect) => rect.width > 0 && rect.height > 0
    )
    const rect = rects.at(-1) ?? range.getBoundingClientRect()
    if (!rect.width && !rect.height) {
      setSelection(null)
      return
    }

    setSelection({
      text,
      range: selectionRange,
      top: Math.max(8, rect.top - 42),
      left: clamp(rect.left + rect.width / 2, 72, window.innerWidth - 72),
    })
  }, [chatActions, content])

  useEffect(() => {
    const handleSelectionChange = () => {
      const root = rootRef.current
      const windowSelection = window.getSelection()
      if (!root || !windowSelection || windowSelection.rangeCount === 0) {
        setSelection(null)
        return
      }
      const anchorNode = windowSelection.anchorNode
      const focusNode = windowSelection.focusNode
      if (
        !anchorNode ||
        !focusNode ||
        !root.contains(anchorNode) ||
        !root.contains(focusNode)
      ) {
        setSelection(null)
      }
    }

    document.addEventListener("selectionchange", handleSelectionChange)
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange)
    }
  }, [])

  const handleAddToChat = () => {
    if (!selection) return
    chatActions?.addFileCommentContext({
      path: contextPath,
      line: selection.range.line,
      startColumn: selection.range.startColumn,
      endLine: selection.range.endLine,
      endColumn: selection.range.endColumn,
      comment: selection.text,
      code: selection.text,
    })
    window.getSelection()?.removeAllRanges()
    setSelection(null)
  }

  return (
    <div
      ref={rootRef}
      onMouseUp={updateSelection}
      onKeyUp={updateSelection}
    >
      {children}
      {selection && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="fixed z-50 h-8 -translate-x-1/2 gap-1.5 rounded-md px-2.5 text-xs shadow-lg"
          style={{ top: selection.top, left: selection.left }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={handleAddToChat}
        >
          <MessageSquarePlus className="size-3.5" />
          Add to chat
        </Button>
      )}
    </div>
  )
}

/**
 * Image viewer that supports trackpad pinch-to-zoom. macOS trackpad pinch
 * gestures are delivered to the browser as `wheel` events with `ctrlKey`
 * set, so we zoom toward the cursor on those and treat plain wheel events as
 * panning once the image is zoomed in. Double-click resets the view.
 */
function ZoomableImage({ src, alt }: { src: string; alt: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [viewSrc, setViewSrc] = useState(src)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    originX: number
    originY: number
  } | null>(null)

  // Reset the view whenever a different image is shown.
  if (viewSrc !== src) {
    setViewSrc(src)
    setScale(1)
    setOffset({ x: 0, y: 0 })
    setIsDragging(false)
  }

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const handleWheel = (e: WheelEvent) => {
      const rect = el.getBoundingClientRect()
      // Cursor position relative to the container center.
      const cx = e.clientX - rect.left - rect.width / 2
      const cy = e.clientY - rect.top - rect.height / 2

      if (e.ctrlKey) {
        // Trackpad pinch (or ctrl+scroll): zoom toward the cursor.
        e.preventDefault()
        setScale((prevScale) => {
          const nextScale = clamp(
            prevScale * Math.exp(-e.deltaY * 0.01),
            MIN_SCALE,
            MAX_SCALE
          )
          const ratio = nextScale / prevScale
          setOffset((prev) => {
            if (nextScale === MIN_SCALE) return { x: 0, y: 0 }
            return {
              x: cx * (1 - ratio) + ratio * prev.x,
              y: cy * (1 - ratio) + ratio * prev.y,
            }
          })
          return nextScale
        })
        return
      }

      // Plain two-finger scroll pans the image while it is zoomed in.
      setScale((prevScale) => {
        if (prevScale > MIN_SCALE) {
          e.preventDefault()
          setOffset((prev) => ({
            x: prev.x - e.deltaX,
            y: prev.y - e.deltaY,
          }))
        }
        return prevScale
      })
    }

    el.addEventListener("wheel", handleWheel, { passive: false })
    return () => el.removeEventListener("wheel", handleWheel)
  }, [])

  const handlePointerDown = (e: React.PointerEvent) => {
    if (scale <= MIN_SCALE) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: offset.x,
      originY: offset.y,
    }
    setIsDragging(true)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    setOffset({
      x: drag.originX + (e.clientX - drag.startX),
      y: drag.originY + (e.clientY - drag.startY),
    })
  }

  const endDrag = (e: React.PointerEvent) => {
    if (dragRef.current?.pointerId === e.pointerId) {
      dragRef.current = null
      setIsDragging(false)
    }
  }

  const resetView = () => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
    setIsDragging(false)
  }

  const isZoomed = scale > MIN_SCALE

  return (
    <div
      ref={containerRef}
      className="flex h-full w-full items-center justify-center overflow-hidden"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={resetView}
      style={{ cursor: isZoomed ? (isDragging ? "grabbing" : "grab") : "default" }}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        className="max-h-full max-w-full object-contain select-none"
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          transformOrigin: "center center",
          willChange: "transform",
        }}
      />
    </div>
  )
}

function resolveFilePath(currentFilePath: string, href: string): string {
  const dir = currentFilePath.split(/[/\\]/).slice(0, -1).join("/")
  const parts = `${dir}/${href}`.split("/")
  const resolved: string[] = []
  for (const part of parts) {
    if (part === "..") resolved.pop()
    else if (part !== ".") resolved.push(part)
  }
  return resolved.join("/")
}

interface FileContentViewProps {
  filePath: string
  openWithAppId?: string | null
  workspacePath?: string
  onOpenFile?: (filePath: string, title: string, line?: number) => void
  initialScrollToLine?: number
  /**
   * When set, load the file's bytes from this fully-qualified, token-appended
   * URL instead of `/file?path=`. Used for chat attachments stored outside any
   * workspace directory.
   */
  sourceUrl?: string
  /**
   * "tab" (default) renders for the main tab area: bordered/muted header,
   * blank loading state. "panel" renders for the embedded review sidebar:
   * transparent header, spinner while loading, sidebar-colored code gutter.
   */
  variant?: "tab" | "panel"
}

export const FileContentView = memo(function FileContentView({
  filePath,
  openWithAppId,
  workspacePath,
  onOpenFile,
  initialScrollToLine,
  sourceUrl,
  variant = "tab",
}: FileContentViewProps) {
  const isPanel = variant === "panel"
  const headerWrapperClass = isPanel ? "bg-transparent" : "border-b bg-muted/20"
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [serverUrl, setServerUrl] = useState<string>("")
  const [markdownPreview, setMarkdownPreview] = useState(false)
  const [htmlPreview, setHtmlPreview] = useState(true)
  const [scrollToLine, setScrollToLine] = useState<number | null>(null)
  const chatActions = useChatActions()

  useEffect(() => {
    if (initialScrollToLine) setScrollToLine(initialScrollToLine)
  }, [initialScrollToLine])

  const workspaceId = useResolveWorkspaceId(workspacePath)
  const lsp = useLspConnection(workspaceId)

  const [fileRefreshKey, setFileRefreshKey] = useState(0)
  const incrementRefreshKey = useCallback(() => setFileRefreshKey(k => k + 1), [])
  useEffect(() => {
    if (!workspaceId) return
    return subscribeToWorkspaceFileUpdates((id) => {
      if (id === workspaceId) incrementRefreshKey()
    })
  }, [workspaceId, incrementRefreshKey])

  const { data: platform } = useElectronPlatform()
  const isMac = platform === "darwin"
  const { data: apps = [] } = useOpenWithApps(isMac)

  const effectiveAppId = useMemo(() => {
    if (!isMac || apps.length === 0) return undefined
    return openWithAppId ?? apps[0].id
  }, [isMac, apps, openWithAppId])

  const relativePath = workspacePath
    ? filePath.startsWith(workspacePath)
      ? filePath.slice(workspacePath.length).replace(/^[/\\]+/, "")
      : filePath
    : filePath
  const pathParts = relativePath.split(/[/\\]/).filter(Boolean)
  const fileName = pathParts[pathParts.length - 1] ?? ""
  const fileExtension = fileName.split(".").pop()?.toLowerCase() ?? ""
  const isMarkdown = fileExtension === "md" || fileExtension === "markdown"
  const isImage = /^(png|jpe?g|gif|svg|webp|bmp|ico|tiff?|avif)$/.test(
    fileExtension
  )
  const isHtml = fileExtension === "html" || fileExtension === "htm"
  const isPdf = fileExtension === "pdf"

  // Only open in LSP when we're rendering source code (not markdown preview, not image, etc.)
  const isCodeView =
    !isImage && !isPdf && !markdownPreview && !(isHtml && htmlPreview)
  const lspFilePath = isCodeView ? filePath : null
  useOpenDocument(lsp, lspFilePath, isCodeView ? content : null)
  const diagnostics = useFileDiagnostics(lsp, lspFilePath)

  const markdownLinkComponents = useMemo(
    () => ({
      a: ({ href, children }: React.ComponentProps<"a">) => {
        const isExternal = !href || /^(https?:|mailto:|#)/.test(href)
        if (isExternal) {
          return (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-4"
            >
              {children}
            </a>
          )
        }
        const resolvedPath = href.startsWith("/")
          ? href
          : resolveFilePath(filePath, href)
        const linkFileName = resolvedPath.split(/[/\\]/).pop() || resolvedPath
        return (
          <button
            type="button"
            onClick={() => onOpenFile?.(resolvedPath, linkFileName)}
            className="cursor-pointer underline underline-offset-4"
          >
            {children}
          </button>
        )
      },
      // GFM task lists (`- [ ]` / `- [x]`). remark-gfm tags the wrapping list
      // with `contains-task-list` and each item with `task-list-item`, emitting
      // a disabled native checkbox. We strip the bullet/indent and swap the raw
      // checkbox for a styled box so the todo list reads as a real checklist.
      ul: ({
        className,
        children,
        node,
        ...props
      }: React.ComponentProps<"ul"> & { node?: unknown }) => {
        void node
        const isTaskList = (className ?? "").includes("contains-task-list")
        return (
          <ul
            className={cn(className, isTaskList && "list-none pl-0")}
            {...props}
          >
            {children}
          </ul>
        )
      },
      li: ({
        className,
        children,
        node,
        ...props
      }: React.ComponentProps<"li"> & { node?: unknown }) => {
        void node
        const isTask = (className ?? "").includes("task-list-item")
        if (isTask) {
          return (
            <li className="my-1 flex items-start gap-2 pl-0 [&::marker]:content-['']">
              {children}
            </li>
          )
        }
        return (
          <li className={className} {...props}>
            {children}
          </li>
        )
      },
      input: ({
        type,
        checked,
      }: React.ComponentProps<"input"> & { node?: unknown }) => {
        if (type !== "checkbox") return null
        return (
          <span
            aria-hidden
            className={cn(
              "mt-[0.2em] inline-flex size-[1.05em] shrink-0 items-center justify-center rounded-[0.3em] border transition-colors",
              checked
                ? "border-primary bg-primary text-primary-foreground"
                : "border-muted-foreground/40"
            )}
          >
            {checked && <Check className="size-[0.8em] stroke-[3]" />}
          </span>
        )
      },
      img: ({ src, alt }: { src?: string; alt?: string }) => {
        if (!src) return null
        const resolvedSrc = /^https?:/.test(src)
          ? src
          : appendToken(
              `${serverUrl}/file?path=${encodeURIComponent(
                src.startsWith("/") ? src : resolveFilePath(filePath, src)
              )}`
            )
        return (
          <img
            src={resolvedSrc}
            alt={alt ?? ""}
            className="max-w-full rounded"
          />
        )
      },
    }),
    [filePath, serverUrl, onOpenFile]
  )

  useEffect(() => {
    setMarkdownPreview(isMarkdown)
    setHtmlPreview(isHtml)
  }, [filePath, isMarkdown, isHtml])

  const language = LANGUAGE_MAP[fileExtension] ?? fileExtension

  const loadedPathRef = useRef<string | null>(null)
  useEffect(() => {
    let cancelled = false
    // A background refresh (fileRefreshKey bumped for the same file) keeps the
    // current contents on screen and swaps them in place once the re-read lands,
    // so the viewer doesn't flash to the loading state on every disk change.
    const isInitialLoad = loadedPathRef.current !== filePath
    if (isInitialLoad) {
      setLoading(true)
      setError(null)
      setContent(null)
    }

    const loadFile = async () => {
      try {
        const url = await getServerUrl()
        if (!cancelled) setServerUrl(url)

        if (isImage) {
          if (!cancelled) {
            setLoading(false)
            loadedPathRef.current = filePath
          }
          return
        }

        const response = await fetch(
          sourceUrl ?? appendToken(`${url}/file?path=${encodeURIComponent(filePath)}`)
        )
        if (!response.ok) {
          throw new Error(`Failed to load file: ${response.statusText}`)
        }
        const text = await response.text()
        if (!cancelled) {
          setContent(text)
          setError(null)
          setLoading(false)
          loadedPathRef.current = filePath
        }
      } catch (err) {
        if (!cancelled) {
          // On a background refresh, keep the last good contents visible rather
          // than replacing the viewer with an error.
          if (isInitialLoad) {
            setError(err instanceof Error ? err.message : "Failed to load file")
          }
          setLoading(false)
        }
      }
    }

    loadFile()
    return () => {
      cancelled = true
    }
  }, [filePath, isImage, fileRefreshKey, sourceUrl])

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <div className={headerWrapperClass}>
          <FileHeader
            pathParts={pathParts}
            filePath={filePath}
            openWithAppId={effectiveAppId}
          />
        </div>
        {isPanel ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              Loading file…
            </div>
          </div>
        ) : (
          <div className="flex-1" />
        )}
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full flex-col">
        <div className={headerWrapperClass}>
          <FileHeader
            pathParts={pathParts}
            filePath={filePath}
            openWithAppId={effectiveAppId}
          />
        </div>
        <div className="flex flex-1 items-center justify-center p-4">
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className={headerWrapperClass}>
        <FileHeader
          pathParts={pathParts}
          filePath={filePath}
          openWithAppId={effectiveAppId}
          isMarkdown={isMarkdown}
          markdownPreview={markdownPreview}
          onToggleMarkdownPreview={
            isMarkdown ? () => setMarkdownPreview(!markdownPreview) : undefined
          }
          isHtml={isHtml}
          htmlPreview={htmlPreview}
          onToggleHtmlPreview={
            isHtml ? () => setHtmlPreview(!htmlPreview) : undefined
          }
          isPdf={isPdf}
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col p-2">
        <div
          className={cn(
            "min-h-0 flex-1 overflow-auto rounded-lg border border-border/50",
            isPanel && "[--code-gutter-bg:var(--sidebar)]",
            isImage && "flex items-center justify-center p-4",
            isHtml && htmlPreview && "overflow-hidden",
            !isImage &&
              markdownPreview &&
              "prose prose-sm max-w-none p-4 dark:prose-invert",
            !isImage &&
              !markdownPreview &&
              !(isHtml && htmlPreview) &&
              "file-viewer-code pl-4"
          )}
          style={
            markdownPreview || (isHtml && htmlPreview)
              ? undefined
              : { userSelect: "text" }
          }
        >
          {isImage ? (
            <ZoomableImage
              src={
                sourceUrl ??
                appendToken(
                  `${serverUrl}/file?path=${encodeURIComponent(filePath)}`
                )
              }
              alt={fileName}
            />
          ) : isHtml && htmlPreview ? (
            <iframe
              src={
                sourceUrl ??
                appendToken(
                  `${serverUrl}/file?path=${encodeURIComponent(filePath)}`
                )
              }
              title={fileName}
              className="h-full w-full border-0"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          ) : markdownPreview ? (
            <MarkdownSelectionActions
              content={content ?? ""}
              contextPath={relativePath}
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeSourcePositions]}
                components={markdownLinkComponents}
              >
                {content ?? ""}
              </ReactMarkdown>
            </MarkdownSelectionActions>
          ) : (
            <MonacoCodeViewer
              code={content ?? ""}
              language={language}
              fontSize="0.75rem"
              diagnostics={diagnostics}
              connection={lsp}
              filePath={lspFilePath}
              onOpenFile={(target, title, line) =>
                onOpenFile?.(target, title, line)
              }
              onAddCommentContext={(context) => {
                const contextPath =
                  workspacePath && context.filePath.startsWith(workspacePath)
                    ? context.filePath
                        .slice(workspacePath.length)
                        .replace(/^[/\\]+/, "")
                    : context.filePath
                chatActions?.addFileCommentContext({
                  path: contextPath,
                  line: context.line,
                  comment: context.comment,
                  code: context.code,
                })
              }}
              scrollToLine={scrollToLine}
            />
          )}
        </div>
      </div>
      {isCodeView && (
        <ProblemsStrip
          diagnostics={diagnostics}
          onJumpToLine={(line) => setScrollToLine(line)}
          position="bottom"
        />
      )}
    </div>
  )
})
