import { memo } from "react"

import { cn } from "@/shared/lib/utils"
import { SubagentCard } from "./subagent-card"
import type { ToolMessage } from "../types"

/**
 * Parallel delegate calls stay as a tight row of compact pills in the main
 * transcript. Selecting any pill moves the detailed live run into the shared
 * subagent panel.
 */
export const SubagentGroup = memo(function SubagentGroup({
  tools,
  isNew = true,
  entryDelayMs = 0,
}: {
  tools: ToolMessage[]
  isNew?: boolean
  entryDelayMs?: number
  rootPath?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1.5",
        isNew && "animate-chat-message-in"
      )}
      style={
        isNew && entryDelayMs > 0
          ? { animationDelay: `${entryDelayMs}ms` }
          : undefined
      }
    >
      {tools.map((tool) => (
        <SubagentCard key={tool.toolCallId} msg={tool} isNew={false} />
      ))}
    </div>
  )
})
