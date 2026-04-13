import { memo, useState } from "react"
import { BrainIcon, ChevronRightIcon } from "lucide-react"

import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"

import { cn } from "@/shared/lib/utils"
import { markdownComponents } from "./markdown-components"

function getThinkingSummary(thinking: string): string {
  const firstMeaningfulLine =
    thinking
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0 && !line.startsWith("```")) ?? ""

  return firstMeaningfulLine
    .replace(/^[#>*+\-\d.\s]+/, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_~`]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

export const ThinkingBlock = memo(function ThinkingBlock({
  thinking,
}: {
  thinking: string
}) {
  const [expanded, setExpanded] = useState(false)
  const summary = getThinkingSummary(thinking)

  return (
    <div className="w-full self-start text-xs">
      <button
        type="button"
        className="group flex w-full items-center gap-1.5 py-0.5 text-left transition-colors"
        onClick={() => setExpanded((e) => !e)}
      >
        <ChevronRightIcon
          className={cn(
            "h-3 w-3 shrink-0 text-muted-foreground/30 transition-transform group-hover:text-muted-foreground/50",
            expanded && "rotate-90"
          )}
        />
        <BrainIcon className="h-3 w-3 shrink-0 transition-colors text-muted-foreground/35 group-hover:text-muted-foreground/55" />
        <span className="min-w-0 flex-1 truncate leading-none italic text-muted-foreground/45 group-hover:text-muted-foreground/65">
          {summary || "thinking…"}
        </span>
      </button>

      {expanded && (
        <div className="mt-1 ml-1.5 animate-in border-l border-border/30 pl-4 duration-200 fade-in-0">
          <div className="prose prose-sm max-w-none text-muted-foreground/55 dark:prose-invert prose-headings:text-foreground/65 dark:prose-headings:text-foreground/65 prose-p:text-muted-foreground/55 prose-strong:text-foreground/65 dark:prose-strong:text-foreground/65 prose-li:text-muted-foreground/55 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
            <Markdown
              remarkPlugins={[remarkGfm]}
              components={markdownComponents}
            >
              {thinking}
            </Markdown>
          </div>
        </div>
      )}
    </div>
  )
})
