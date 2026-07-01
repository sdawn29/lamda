import { memo } from "react"
import ReactMarkdown from "react-markdown"
import {
  chatProseClass,
  markdownComponents,
  remarkPlugins,
} from "./markdown-components"
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
          remarkPlugins={remarkPlugins}
          components={markdownComponents}
        >
          {displayContent}
        </ReactMarkdown>
      </div>
    </div>
  )
})
