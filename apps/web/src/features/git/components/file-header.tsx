// ─── File Header ───────────────────────────────────────────────────────────────

import { useCallback } from "react"
import { ExternalLink, FileText, Globe } from "lucide-react"
import { openFileWithApp, openExternal } from "@/features/electron/api"
import { Button } from "@/shared/ui/button"

interface FileHeaderProps {
  pathParts: string[]
  filePath: string
  openWithAppId?: string | null
  isMarkdown?: boolean
  markdownPreview?: boolean
  onToggleMarkdownPreview?: () => void
  isHtml?: boolean
  isPdf?: boolean
}

export function FileHeader({
  pathParts,
  filePath,
  openWithAppId,
  isMarkdown,
  markdownPreview,
  onToggleMarkdownPreview,
  isHtml,
  isPdf,
}: FileHeaderProps) {
  const handleOpenClick = useCallback(() => {
    // Open with the selected editor (or default if none selected)
    openFileWithApp(filePath, openWithAppId ?? undefined)
  }, [filePath, openWithAppId])

  const handleOpenInBrowser = useCallback(async () => {
    // For HTML and PDF files, open in browser using the file:// protocol
    const url = `file://${filePath}`
    await openExternal(url)
  }, [filePath])

  return (
    <div className="scrollbar-none flex min-w-0 items-center gap-2 px-2 py-1 text-xs">
      <div className="flex min-w-0 flex-1 items-center overflow-x-auto">
        {pathParts.map((part, i) => (
          <span key={i} className="flex shrink-0 items-center">
            {i > 0 && <span className="mx-1 text-muted-foreground/50">›</span>}
            <span
              className={
                i === pathParts.length - 1
                  ? "font-medium text-foreground"
                  : "text-muted-foreground"
              }
            >
              {part}
            </span>
          </span>
        ))}
      </div>

      {isMarkdown && onToggleMarkdownPreview && (
        <Button
          variant={markdownPreview ? "secondary" : "outline"}
          size="icon"
          onClick={onToggleMarkdownPreview}
          className="h-6 gap-1 text-[10px]"
          title={markdownPreview ? "Show raw markdown" : "Preview markdown"}
        >
          <FileText data-icon="inline-start" />
        </Button>
      )}

      {(isHtml || isPdf) && (
        <Button
          variant="outline"
          size="icon"
          onClick={handleOpenInBrowser}
          className="h-6 gap-1 text-[10px]"
          title={isHtml ? "Open in browser" : "Open in default PDF viewer"}
        >
          <Globe data-icon="inline-start" />
        </Button>
      )}

      <Button
        variant="outline"
        size="icon"
        onClick={handleOpenClick}
        className="h-6 gap-1 text-[10px]"
        title="Open in editor"
      >
        <ExternalLink data-icon="inline-start" />
      </Button>
    </div>
  )
}
