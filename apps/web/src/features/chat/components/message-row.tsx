import { memo } from "react"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import {
  AlertCircleIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  RefreshCwIcon,
  PlayIcon,
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
import { type AssistantMessage, type ErrorMessage, type Message } from "../types"

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

function estimateTokens(text: string): number {
  return Math.max(1, Math.round(text.length / 4))
}

function formatTokenCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function TokenCounter({ up, down }: { up?: number; down?: number }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground/50">
      {up != null && (
        <span className="flex items-center gap-0.5">
          <ArrowUpIcon className="h-3 w-3" />
          {formatTokenCount(up)}
        </span>
      )}
      {down != null && (
        <span className="flex items-center gap-0.5">
          <ArrowDownIcon className="h-3 w-3" />
          {formatTokenCount(down)}
        </span>
      )}
    </div>
  )
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

      {hasError && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{message.errorMessage}</span>
        </div>
      )}

      <div className="flex items-center gap-3">
        {hasMeta && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {providerMeta && (
              <span className="shrink-0">{providerMeta.icon}</span>
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
        <TokenCounter
          up={
            message.thinking.length > 0
              ? estimateTokens(message.thinking)
              : undefined
          }
          down={estimateTokens(message.content)}
        />
        <CopyButton text={assistantCopyText(message, showThinking)} />
      </div>
    </div>
  )
}

function ErrorActions({
  action,
  onAction,
}: {
  action: ErrorMessage["action"]
  onAction?: (action: ErrorMessage["action"]) => void
}) {
  if (!action || !onAction) return null

  if (action.type === "retry") {
    return (
      <Button
        size="sm"
        variant="outline"
        className="h-7 gap-1.5 border-destructive/30 text-xs text-destructive hover:bg-destructive/10"
        onClick={() => onAction(action)}
      >
        <RefreshCwIcon className="h-3.5 w-3.5" />
        Retry
      </Button>
    )
  }

  if (action.type === "continue") {
    return (
      <Button
        size="sm"
        variant="outline"
        className="h-7 gap-1.5 border-primary/30 text-xs text-primary hover:bg-primary/10"
        onClick={() => onAction(action)}
      >
        <PlayIcon className="h-3.5 w-3.5" />
        Continue
      </Button>
    )
  }

  if (action.type === "dismiss") {
    return (
      <Button
        size="sm"
        variant="ghost"
        className="h-7 gap-1.5 text-xs text-muted-foreground hover:bg-muted"
        onClick={() => onAction(action)}
      >
        <XIcon className="h-3.5 w-3.5" />
        Dismiss
      </Button>
    )
  }

  return null
}

function ErrorMessageBlock({
  message,
  onAction,
}: {
  message: ErrorMessage
  onAction?: (action: ErrorMessage["action"]) => void
}) {
  return (
    <div className="group flex animate-in flex-col gap-2 duration-300 fade-in-0 slide-in-from-bottom-1">
      <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5">
        {message.retryable ? (
          <RefreshCwIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        ) : (
          <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-destructive">
              {message.title}
            </span>
            <ErrorActions action={message.action} onAction={onAction} />
          </div>
          <span className="text-sm text-destructive/80">{message.message}</span>
          {message.retryable && message.retryCount !== undefined && (
            <span className="text-xs text-muted-foreground">
              Retry attempt {message.retryCount}
            </span>
          )}
        </div>
      </div>
      <CopyButton text={`${message.title}: ${message.message}`} />
    </div>
  )
}

export function getMessageKey(message: Message, index: number): string {
  if (message.role === "error") return message.id
  return message.role === "tool" ? message.toolCallId : `${message.role}-${index}`
}

export function estimateMessageSize(message: Message): number {
  if (message.role === "tool") {
    return message.status === "running" ? 84 : 120
  }

  if (message.role === "user") {
    return message.content.length > 220 ? 96 : 68
  }

  if (message.role === "error") {
    return 80
  }

  const assistantLength = message.content.length + message.thinking.length
  if (assistantLength > 1_200) return 320
  if (assistantLength > 400) return 220
  if (assistantLength > 120) return 144
  return 104
}

export interface MessageRowProps {
  message: Message
  commandsByName: ReadonlyMap<string, SlashCommand>
  showThinking: boolean
  onErrorAction?: (messageId: string, action: ErrorMessage["action"]) => void
}

export const MessageRow = memo(function MessageRow({
  message,
  commandsByName,
  showThinking,
  onErrorAction,
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
          <TokenCounter up={estimateTokens(message.content)} />
        </div>
      </div>
    )
  }

  if (message.role === "error") {
    return (
      <ErrorMessageBlock
        message={message}
        onAction={
          onErrorAction
            ? (action) => onErrorAction(message.id, action)
            : undefined
        }
      />
    )
  }

  return <AssistantMessageBlock message={message} showThinking={showThinking} />
})
