import { memo } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { markdownComponents } from "./markdown-components"
import { useWordReveal } from "../hooks/use-word-reveal"

const proseClass =
  "prose prose-sm max-w-none dark:prose-invert prose-headings:text-foreground prose-headings:text-sm prose-headings:leading-[1.75] prose-headings:my-0 prose-p:leading-[1.75] prose-p:mt-0 prose-p:mb-[0.75em] prose-ul:my-0 prose-ol:my-0 prose-li:my-0 prose-blockquote:my-0 [&_li]:leading-[1.75] [&_li]:text-sm [&>*+*]:mt-2 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_a]:transition-colors [&_a:hover]:text-primary/70"

export const ThinkingBlock = memo(function ThinkingBlock({
  thinking,
  isNew = false,
}: {
  thinking: string
  isNew?: boolean
}) {
  const displayContent = useWordReveal(thinking, isNew)

  return (
    <div className="opacity-50">
      <div className={proseClass}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {displayContent}
        </ReactMarkdown>
      </div>
    </div>
  )
})
