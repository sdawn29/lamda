import { memo, useState } from "react"
import { ChevronRight } from "lucide-react"
import { FileAccordionItem } from "./file-accordion-item"
import { type ChangedFile } from "./status-badge"
import { type DiffMode } from "./diff-view"
import { cn } from "@/shared/lib/utils"

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
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="border-b border-border/40 last:border-0">
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-muted/40"
      >
        <ChevronRight
          className={cn(
            "h-3 w-3 shrink-0 text-muted-foreground/40 transition-transform duration-150",
            !collapsed && "rotate-90"
          )}
        />
        <span className="text-[10px] font-semibold tracking-widest text-muted-foreground/50 uppercase">
          {label}
        </span>
        {files.length > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-muted px-1 text-[10px] font-medium text-muted-foreground">
            {files.length}
          </span>
        )}
      </button>

      {!collapsed && (
        <div className="animate-in duration-150 fade-in-0 slide-in-from-top-1">
          {files.length === 0 && emptyText && (
            <p className="px-4 py-2.5 text-xs text-muted-foreground/40">
              {emptyText}
            </p>
          )}
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
      )}
    </div>
  )
})