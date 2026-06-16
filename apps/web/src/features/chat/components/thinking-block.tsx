import { memo } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { chatProseClass, markdownComponents } from "./markdown-components"
import { useWordReveal } from "../hooks/use-word-reveal"

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
      <div className={chatProseClass}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={markdownComponents}
        >
          {displayContent}
        </ReactMarkdown>
      </div>
    </div>
  )
})
