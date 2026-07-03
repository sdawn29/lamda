import { memo } from "react"
import { FileListItem } from "./file-list-item"
import { type ChangedFile } from "./status-badge"
import { type DiffMode } from "./diff-view"

export const FileAccordionItem = memo(function FileAccordionItem({
  file,
  sessionId,
  mode,
  onStageToggle,
  onRevert,
}: {
  file: ChangedFile
  sessionId: string
  mode: DiffMode
  onStageToggle: (file: ChangedFile) => Promise<void>
  onRevert: (file: ChangedFile) => Promise<void>
}) {
  return (
    <FileListItem
      file={file}
      sessionId={sessionId}
      mode={mode}
      showActions={true}
      onStage={onStageToggle}
      onRevert={onRevert}
    />
  )
})
