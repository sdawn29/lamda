import { memo } from "react"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import {
  AlertCircleIcon,
  RotateCwIcon,
  XIcon,
} from "lucide-react"

import { ToolCallBlock } from "./tool-call-block"
import { markdownComponents } from "./markdown-components"
import { UserMessageContent } from "./user-message"
import { ThinkingBlock } from "./thinking-block"
import { CopyButton } from "@/shared/components/copy-button"
import { Button } from "@/shared/ui/button"
import { getProviderMeta } from "@/shared/lib/provider-meta"
import type { SlashCommand } from "../api"
import {
  type AssistantMessage,
  type ErrorAction,
  type ErrorMessage,
  type Message,
  type UserMessage,
} from "../types"

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



function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  const hours = date.getHours()
  const minutes = date.getMinutes().toString().padStart(2, "0")
  const ampm = hours >= 12 ? "pm" : "am"
  const displayHours = hours % 12 || 12
  return `${displayHours}:${minutes} ${ampm}`
}

interface TimeStampProps {
  timestamp: number
}

function TimeStamp({ timestamp }: TimeStampProps) {
  return (
    <span className="text-xs text-muted-foreground/40 tabular-nums">
      {formatTime(timestamp)}
    </span>
  )
}

interface AssistantMessageBlockProps {
  message: AssistantMessage
  showThinking: boolean
  /** Render with destructive text color (for role="error" messages) */
  isError?: boolean
}

function AssistantMessageBlock({
  message,
  showThinking,
  isError = false,
}: AssistantMessageBlockProps) {
  const hasThinking = showThinking && message.thinking.trim().length > 0
  const hasContent = message.content.length > 0

  if (!hasThinking && !hasContent) return null

  const providerMeta = message.provider
    ? getProviderMeta(message.provider)
    : null
  const THINKING_LEVEL_LABELS: Record<string, string> = {
    low: "Low",
    medium: "Med",
    high: "High",
    xhigh: "Max",
  }
  const thinkingLabel = message.thinkingLevel
    ? (THINKING_LEVEL_LABELS[message.thinkingLevel] ?? message.thinkingLevel)
    : null
  const hasMeta = !!(message.model ?? message.responseTime != null)

  // Apply destructive text color when rendered as an error
  const proseClass = isError
    ? "prose prose-sm max-w-none dark:prose-invert text-destructive [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_a]:text-destructive [&_a]:underline [&_a]:underline-offset-4"
    : "prose prose-sm max-w-none dark:prose-invert [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"

  return (
    <div className="group flex animate-in flex-col gap-2 duration-300 fade-in-0 slide-in-from-bottom-1">
      {hasThinking && <ThinkingBlock thinking={message.thinking} />}

      {hasContent && (
        <div className={proseClass}>
          <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {message.content}
          </Markdown>
        </div>
      )}

      <div className="flex items-center gap-3">
        {hasMeta && (
          <div
            className={
              isError
                ? "flex items-center gap-1.5 text-xs text-destructive/60"
                : "flex items-center gap-1.5 text-xs text-muted-foreground"
            }
          >
            {providerMeta && (
              <span className="flex shrink-0 items-center">
                {providerMeta.icon}
              </span>
            )}
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
        {message.createdAt != null && (
          <TimeStamp timestamp={message.createdAt} />
        )}
        <CopyButton text={assistantCopyText(message, showThinking)} />
      </div>
    </div>
  )
}

export function getMessageKey(message: Message, index: number): string {
  if (message.role === "error") return message.id
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

  const contentLength =
    message.role === "error"
      ? (message as ErrorMessage).message.length
      : (message as AssistantMessage).content.length +
        (message as AssistantMessage).thinking.length
  if (contentLength > 1_200) return 320
  if (contentLength > 400) return 220
  if (contentLength > 120) return 144
  return 104
}

function ErrorBlock({
  message,
  onAction,
}: {
  message: ErrorMessage
  onAction?: (action: ErrorAction, id: string) => void
}) {
  const { action } = message
  const canRetry = action?.type === "retry" && !!action.prompt
  const showActions = !!onAction && !!action && action.type !== "continue"

  return (
    <div className="group flex animate-in flex-col duration-300 fade-in-0 slide-in-from-bottom-1">
      <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3">
        <div className="flex items-start gap-2.5">
          <AlertCircleIcon className="mt-px h-4 w-4 shrink-0 text-destructive/60" />
          <div className="min-w-0 flex-1">
            <p className="text-sm leading-none font-medium text-destructive/90">
              {message.title}
              {message.retryCount != null && (
                <span className="ml-2 text-xs font-normal text-destructive/50">
                  attempt {message.retryCount}
                </span>
              )}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-destructive/65">
              {message.message}
            </p>
          </div>
          {showActions && !canRetry && (
            <button
              type="button"
              onClick={() => onAction({ type: "dismiss" }, message.id)}
              className="shrink-0 text-destructive/40 transition-colors hover:text-destructive/70"
              aria-label="Dismiss"
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {showActions && canRetry && (
          <div className="mt-3 flex gap-2 pl-6.5">
            <Button
              size="xs"
              variant="destructive"
              onClick={() => onAction(action!, message.id)}
            >
              <RotateCwIcon />
              Retry
            </Button>
            <Button
              size="xs"
              variant="ghost"
              className="text-muted-foreground/60 hover:text-foreground/80"
              onClick={() => onAction({ type: "dismiss" }, message.id)}
            >
              Dismiss
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

export interface MessageRowProps {
  message: Message
  commandsByName: ReadonlyMap<string, SlashCommand>
  showThinking: boolean
  onAction?: (action: ErrorAction, id: string) => void
}

export const MessageRow = memo(function MessageRow({
  message,
  commandsByName,
  showThinking,
  onAction,
}: MessageRowProps) {
  if (message.role === "tool") {
    return <ToolCallBlock msg={message} />
  }

  if (message.role === "user") {
    return (
      <div className="group flex animate-in flex-col items-end gap-1.5 self-end duration-200 fade-in-0 slide-in-from-bottom-2">
        <div
          className="rounded-xl bg-muted px-4 py-2.5 text-sm"
          data-selectable
        >
          <UserMessageContent
            content={message.content}
            commandsByName={commandsByName}
          />
        </div>
        <div className="flex items-center gap-2">
          <CopyButton text={message.content} />
          {(message as UserMessage).createdAt != null && (
            <TimeStamp timestamp={(message as UserMessage).createdAt!} />
          )}
        </div>
      </div>
    )
  }

  if (message.role === "error") {
    return <ErrorBlock message={message as ErrorMessage} onAction={onAction} />
  }

  return <AssistantMessageBlock message={message} showThinking={showThinking} />
})
