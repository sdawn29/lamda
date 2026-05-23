import { useEffect, useMemo, useState, memo } from "react"
import { Loader2 } from "lucide-react"
import { Alert, AlertDescription } from "@/shared/ui/alert"
import { FileHeader } from "@/features/git/components/file-header"
import { useElectronPlatform, useOpenWithApps } from "@/features/electron"
import { getServerUrl } from "@/shared/lib/client"
import { cn } from "@/shared/lib/utils"
import { LANGUAGE_MAP } from "@/shared/lib/language-map"
import {
  LspCodeViewer,
  ProblemsStrip,
  OutlinePanel,
  useFileDiagnostics,
  useLspConnection,
  useOpenDocument,
  useResolveWorkspaceId,
  useDocumentSymbols,
} from "@/features/lsp"
import { useChatActions } from "@/features/chat/contexts/chat-actions-context"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

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
  onOpenFile?: (filePath: string, title: string) => void
}

export const FileContentView = memo(function FileContentView({
  filePath,
  openWithAppId,
  workspacePath,
  onOpenFile,
}: FileContentViewProps) {
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [serverUrl, setServerUrl] = useState<string>("")
  const [markdownPreview, setMarkdownPreview] = useState(false)
  const [htmlPreview, setHtmlPreview] = useState(true)
  const [scrollToLine, setScrollToLine] = useState<number | null>(null)
  const chatActions = useChatActions()

  const workspaceId = useResolveWorkspaceId(workspacePath)
  const lsp = useLspConnection(workspaceId)

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
  const symbols = useDocumentSymbols(lsp, lspFilePath, isCodeView)

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
      img: ({ src, alt }: { src?: string; alt?: string }) => {
        if (!src) return null
        const resolvedSrc = /^https?:/.test(src)
          ? src
          : `${serverUrl}/file?path=${encodeURIComponent(
              src.startsWith("/") ? src : resolveFilePath(filePath, src)
            )}`
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

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setContent(null)

    const loadFile = async () => {
      try {
        const url = await getServerUrl()
        if (!cancelled) setServerUrl(url)

        if (isImage) {
          if (!cancelled) setLoading(false)
          return
        }

        const response = await fetch(
          `${url}/file?path=${encodeURIComponent(filePath)}`
        )
        if (!response.ok) {
          throw new Error(`Failed to load file: ${response.statusText}`)
        }
        const text = await response.text()
        if (!cancelled) {
          setContent(text)
          setLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load file")
          setLoading(false)
        }
      }
    }

    loadFile()
    return () => {
      cancelled = true
    }
  }, [filePath, isImage])

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b bg-muted/20">
          <FileHeader
            pathParts={pathParts}
            filePath={filePath}
            openWithAppId={effectiveAppId}
          />
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            Loading file…
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b bg-muted/20">
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
      <div className="border-b bg-muted/20">
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
      {isCodeView && (
        <>
          <ProblemsStrip
            diagnostics={diagnostics}
            onJumpToLine={(line) => setScrollToLine(line)}
          />
          <OutlinePanel
            symbols={symbols}
            onJumpToLine={(line) => setScrollToLine(line)}
          />
        </>
      )}
      <div className="flex min-h-0 flex-1 flex-col p-2">
        <div
          className={cn(
            "min-h-0 flex-1 overflow-auto rounded-lg border border-border/50",
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
            <img
              src={`${serverUrl}/file?path=${encodeURIComponent(filePath)}`}
              alt={fileName}
              className="max-h-full max-w-full object-contain"
            />
          ) : isHtml && htmlPreview ? (
            <iframe
              src={`${serverUrl}/file?path=${encodeURIComponent(filePath)}`}
              title={fileName}
              className="h-full w-full border-0"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          ) : markdownPreview ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={markdownLinkComponents}
            >
              {content ?? ""}
            </ReactMarkdown>
          ) : (
            <LspCodeViewer
              code={content ?? ""}
              language={language}
              fontSize="0.75rem"
              diagnostics={diagnostics}
              connection={lsp}
              filePath={lspFilePath}
              onOpenFile={(target, title) => onOpenFile?.(target, title)}
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
    </div>
  )
})
