import { memo } from "react"
import { useMainTabs, FileContentView } from "@/features/main-tabs"

export const FileContent = memo(function FileContent({
  filePath,
  openWithAppId,
  workspacePath,
  initialScrollToLine,
  sourceUrl,
}: {
  filePath: string
  openWithAppId?: string | null
  workspacePath?: string
  initialScrollToLine?: number
  sourceUrl?: string
}) {
  const { addFileTab } = useMainTabs()
  return (
    <FileContentView
      variant="panel"
      filePath={filePath}
      openWithAppId={openWithAppId}
      workspacePath={workspacePath}
      initialScrollToLine={initialScrollToLine}
      sourceUrl={sourceUrl}
      onOpenFile={(target, title, line) =>
        addFileTab({
          title,
          filePath: target,
          workspacePath,
          scrollToLine: line,
        })
      }
    />
  )
})
