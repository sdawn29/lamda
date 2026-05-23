import { memo } from "react"
import { FileAccordionItem } from "./file-accordion-item"
import { type ChangedFile } from "./status-badge"
import { type DiffMode } from "./diff-view"
import { SectionCard } from "./section-card"

export const FilesSection = memo(function FilesSection({
  label,
  files,
  sessionId,
  mode,
  onStageToggle,
  onRevert,
  emptyText,
}: {
  label: string
  files: ChangedFile[]
  sessionId: string
  mode: DiffMode
  onStageToggle: (file: ChangedFile) => Promise<void>
  onRevert: (file: ChangedFile) => Promise<void>
  emptyText?: string
}) {
  return (
    <SectionCard label={label} count={files.length}>
      {files.length === 0 && emptyText && (
        <p className="px-3 py-2 text-[11px] text-muted-foreground/50">{emptyText}</p>
      )}
      <div className="divide-y divide-border/25">
        {files.map((file, i) => (
          <FileAccordionItem
            key={i}
            file={file}
            sessionId={sessionId}
            mode={mode}
            onStageToggle={onStageToggle}
            onRevert={onRevert}
          />
        ))}
      </div>
    </SectionCard>
  )
})
