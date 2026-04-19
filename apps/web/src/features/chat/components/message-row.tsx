import { memo } from "react"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"

import { ToolCallBlock } from "./tool-call-block"
import { markdownComponents } from "./markdown-components"
import { UserMessageContent } from "./user-message"
import { ThinkingBlock } from "./thinking-block"
import { CopyButton } from "@/shared/components/copy-button"
import { getProviderMeta } from "@/shared/lib/provider-meta"
import type { SlashCommand } from "../api"
import { type AssistantMessage, type Message } from "../types"

const THINKING_LEVEL_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Med",
  high: "High",
  xhigh: "Max",
}

function assistantCopyText(
  message: AssistantMessage,
  includeThinking: boolean
): string {
  const sections: string[] = []

  if (includeThinking && message.thinking.trim()) {
    sections.push(
      message.content.trim()
        ? `Thinking\n${message.thinking.trim()}`
        : message.thinking.trim()
    )
  }

  if (message.content.trim()) {
    sections.push(message.content.trim())
  }

  return sections.join("\n\n")
}

function formatResponseTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function AssistantMessageBlock({
  message,
  showThinking,
}: {
  message: AssistantMessage
  showThinking: boolean
}) {
  const hasThinking = showThinking && message.thinking.trim().length > 0
  const hasContent = message.content.length > 0

  if (!hasThinking && !hasContent) return null

  const providerMeta = message.provider ? getProviderMeta(message.provider) : null
  const thinkingLabel = message.thinkingLevel ? THINKING_LEVEL_LABELS[message.thinkingLevel] : null
  const hasMeta = !!(message.model ?? message.responseTime != null)

  return (
    <div className="group flex animate-in flex-col gap-2 duration-300 fade-in-0 slide-in-from-bottom-1">
      {hasThinking && <ThinkingBlock thinking={message.thinking} />}

      {hasContent && (
        <div className="prose prose-sm max-w-none dark:prose-invert [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
          <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {message.content}
          </Markdown>
        </div>
      )}

      <div className="flex items-center gap-3">
        {hasMeta && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {providerMeta && <span className="shrink-0">{providerMeta.icon}</span>}
            {message.model && <span>{message.model}</span>}
            {thinkingLabel && (
              <>
                <span className="opacity-40">·</span>
                <span>{thinkingLabel}</span>
              </>
            )}
            {message.responseTime != null && (
              <>
                <span className="opacity-40">·</span>
                <span>{formatResponseTime(message.responseTime)}</span>
              </>
            )}
          </div>
        )}
        <CopyButton text={assistantCopyText(message, showThinking)} />
      </div>
    </div>
  )
}

export function getMessageKey(message: Message, index: number): string {
  return message.role === "tool"
    ? message.toolCallId
    : `${message.role}-${index}`
}

export function estimateMessageSize(message: Message): number {
  if (message.role === "tool") {
    return message.status === "running" ? 84 : 120
  }

  if (message.role === "user") {
    return message.content.length > 220 ? 96 : 68
  }

  const assistantLength = message.content.length + message.thinking.length
  if (assistantLength > 1_200) return 320
  if (assistantLength > 400) return 220
  if (assistantLength > 120) return 144
  return 104
}

export const MessageRow = memo(function MessageRow({
  message,
  commandsByName,
  showThinking,
}: {
  message: Message
  commandsByName: ReadonlyMap<string, SlashCommand>
  showThinking: boolean
}) {
  if (message.role === "tool") {
    return <ToolCallBlock msg={message} />
  }

  if (message.role === "user") {
    return (
      <div className="group flex animate-in flex-col items-end gap-1.5 self-end duration-200 fade-in-0 slide-in-from-bottom-2">
        <div className="rounded-xl bg-muted px-4 py-2 text-sm" data-selectable>
          <UserMessageContent
            content={message.content}
            commandsByName={commandsByName}
          />
        </div>
        <CopyButton text={message.content} />
      </div>
    )
  }

  return <AssistantMessageBlock message={message} showThinking={showThinking} />
})
