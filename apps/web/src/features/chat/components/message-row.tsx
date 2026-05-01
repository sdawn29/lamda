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
import { formatDuration, formatTime } from "@/shared/lib/formatters"
import type { SlashCommand } from "../api"
import {
  type AssistantMessage,
  type ErrorAction,
  type ErrorMessage,
  type Message,
  type UserMessage,
  type AbortMessage,
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
}

function AssistantMessageBlock({
  message,
  showThinking,
}: AssistantMessageBlockProps) {
  const hasThinking = showThinking && message.thinking.trim().length > 0
  const hasContent = message.content.length > 0
  const hasError = !!message.errorMessage

  if (!hasThinking && !hasContent && !hasError) return null

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

  const proseClass = "prose prose-sm max-w-none dark:prose-invert prose-headings:text-foreground [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_a]:transition-colors [&_a:hover]:text-primary/70"

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

      {hasError && (
        <div className="flex items-center gap-1.5 text-xs text-destructive/70">
          <AlertCircleIcon className="h-3.5 w-3.5 shrink-0" />
          <span>{message.errorMessage}</span>
        </div>
      )}

      <div className="flex items-center gap-3">
        {hasMeta && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
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
                <span>{formatDuration(message.responseTime)}</span>
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
  if (message.role === "error" || message.role === "abort") return message.id
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
  const canDismiss = !!onAction && !!action && action.type !== "continue"

  return (
    <div className="group flex animate-in flex-col duration-300 fade-in-0 slide-in-from-bottom-1">
      <div className="rounded-lg border border-border/50 px-3 py-2.5">
        <div className="flex items-start gap-2">
          <AlertCircleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive/70" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-medium text-foreground">
                {message.title}
              </span>
              {message.retryCount != null && (
                <span className="text-[10px] text-muted-foreground/60">
                  attempt {message.retryCount}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {message.message}
            </p>
            {canDismiss && canRetry && (
              <div className="mt-2 flex gap-1.5">
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
          {canDismiss && !canRetry && (
            <Button
              size="icon-xs"
              variant="ghost"
              className="shrink-0 -mt-0.5 text-muted-foreground/40 hover:text-muted-foreground"
              onClick={() => onAction({ type: "dismiss" }, message.id)}
            >
              <XIcon />
              <span className="sr-only">Dismiss</span>
            </Button>
          )}
        </div>
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

function AbortBlock({ message: _ }: { message: AbortMessage }) {
  void _
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="flex-1 h-px bg-border" />
      <div className="shrink-0 rounded-full border border-destructive/30 bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive/80">
        Operation Aborted
      </div>
      <div className="flex-1 h-px bg-border" />
    </div>
  )
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

  if (message.role === "abort") {
    return <AbortBlock message={message} />
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
