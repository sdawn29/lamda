import { memo, useState } from "react"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { PluggableList } from "unified"
import {
  AlertCircleIcon,
  GitForkIcon,
  SparklesIcon,
  Undo2,
  Loader2,
} from "lucide-react"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/shared/ui/alert-dialog"

const remarkPlugins: PluggableList = [remarkGfm]

const proseClass =
  "prose prose-sm max-w-none dark:prose-invert prose-headings:text-foreground prose-headings:text-sm prose-headings:leading-[1.4] prose-headings:my-0 prose-p:leading-[1.6] prose-p:mt-0 prose-p:mb-[0.75em] prose-ul:my-0 prose-ol:my-0 prose-li:my-0 prose-blockquote:my-0 [&_li]:leading-[1.6] [&_li]:text-sm [&_li>p]:my-0 [&>*+*]:mt-1.5 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_a]:transition-colors [&_a:hover]:text-primary/70"

import { ToolCallBlock } from "./tool-call-block"
import { markdownComponents } from "./markdown-components"
import { UserMessageContent } from "./user-message"
import { CopyButton } from "@/shared/components/copy-button"
import { Button } from "@/shared/ui/button"
import { getProviderMeta } from "@/shared/lib/provider-meta"
import { formatDuration, formatTime } from "@/shared/lib/formatters"
import type { SlashCommand } from "../api"
import {
  type AssistantMessage,
  type CompactionMessage,
  type Message,
  type UserMessage,
  type AbortMessage,
} from "../types"
import { cn } from "@/shared/lib/utils"
import { useWordReveal } from "../hooks/use-word-reveal"

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
  isNew?: boolean
  entryDelayMs?: number
  isLastInTurn?: boolean
  turnMessages?: AssistantMessage[]
}

const THINKING_LEVEL_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Med",
  high: "High",
  xhigh: "Max",
}

const AssistantMessageBlock = memo(function AssistantMessageBlock({
  message,
  showThinking,
  isNew = true,
  entryDelayMs = 0,
  isLastInTurn = true,
  turnMessages,
}: AssistantMessageBlockProps) {
  const hasContent = message.content.length > 0
  const hasError = !!message.errorMessage
  const displayContent = useWordReveal(message.content, isNew)

  if (!hasContent && !hasError) return null

  const providerMeta = message.provider
    ? getProviderMeta(message.provider)
    : null
  const thinkingLabel = message.thinkingLevel
    ? (THINKING_LEVEL_LABELS[message.thinkingLevel] ?? message.thinkingLevel)
    : null
  const hasMeta = !!(
    message.model ||
    thinkingLabel ||
    message.responseTime != null
  )

  // Wrapper-only fade — content updates (word reveal) shouldn't restart the
  // entry animation, so we apply the class to a stable outer wrapper that
  // only changes when the message identity changes.
  return (
    <div
      className={cn(
        "group flex flex-col gap-2",
        isNew && "animate-chat-message-in"
      )}
      style={
        isNew && entryDelayMs > 0
          ? { animationDelay: `${entryDelayMs}ms` }
          : undefined
      }
    >
      {hasContent && (
        <div className={proseClass}>
          <Markdown
            remarkPlugins={remarkPlugins}
            components={markdownComponents}
          >
            {displayContent}
          </Markdown>
        </div>
      )}

      {hasError && (
        <div className="w-full rounded-lg border border-destructive/30 text-xs transition-colors">
          <div className="flex items-center gap-2 px-2.5 py-1.5">
            <span className="flex shrink-0 items-center gap-1.5 rounded bg-destructive/10 px-1.5 py-0.5 text-[11px] font-medium text-destructive">
              <AlertCircleIcon className="h-3 w-3 shrink-0" />
              <span className="leading-none">Error</span>
            </span>
            <span className="min-w-0 flex-1 truncate text-muted-foreground/70">
              {message.errorMessage}
            </span>
          </div>
        </div>
      )}

      {isLastInTurn && !hasError && (
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
          <CopyButton
            text={
              turnMessages
                ? turnMessages
                    .map((m) => assistantCopyText(m, showThinking))
                    .filter(Boolean)
                    .join("\n\n")
                : assistantCopyText(message, showThinking)
            }
          />
        </div>
      )}
    </div>
  )
})

export function getMessageKey(message: Message, index: number): string {
  if (
    message.role === "error" ||
    message.role === "abort" ||
    message.role === "compaction"
  )
    return message.id
  if (message.role === "tool") return `tool-${message.toolCallId}`
  // Prefer DB id when present — stable across prepends & remounts and unique
  // even when two messages share the same millisecond-precision createdAt.
  if (message.role === "user" && message.id) return `user-${message.id}`
  if (message.role === "assistant" && message.id) return `assistant-${message.id}`
  // Streaming messages have no id yet — fall back to createdAt + role, then index.
  // index covers the in-flight optimistic/streaming message that has neither.
  if (message.createdAt != null) return `${message.role}-t${message.createdAt}`
  return `${message.role}-i${index}`
}

export function estimateMessageSize(message: Message): number {
  if (message.role === "tool") {
    return message.status === "running" ? 84 : 120
  }

  if (message.role === "user") {
    return message.content.length > 220 ? 96 : 68
  }

  const contentLength =
    (message as AssistantMessage).content.length +
    (message as AssistantMessage).thinking.length
  if (contentLength > 1_200) return 320
  if (contentLength > 400) return 220
  if (contentLength > 120) return 144
  return 104
}

export interface MessageRowProps {
  message: Message
  commandsByName: ReadonlyMap<string, SlashCommand>
  showThinking: boolean
  isNewMessage?: boolean
  /** Stagger offset (ms) applied as CSS animation-delay when isNewMessage is true. */
  entryDelayMs?: number
  isLastInTurn?: boolean
  turnMessages?: AssistantMessage[]
  rootPath?: string
  onFork?: (blockId: string) => Promise<void>
  onRevert?: (blockId: string) => Promise<void>
  isReverting?: boolean
}

function AbortBlock({ message: _ }: { message: AbortMessage }) {
  void _
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="h-px flex-1 bg-border" />
      <div className="shrink-0 rounded-full border border-destructive/30 bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive/80">
        Operation Aborted
      </div>
      <div className="h-px flex-1 bg-border" />
    </div>
  )
}

const COMPACTION_LABEL: Record<CompactionMessage["reason"], string> = {
  manual: "Context compacted",
  threshold: "Context compacted",
  overflow: "Context window freed",
}

function CompactionBlock({ message }: { message: CompactionMessage }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="h-px flex-1 bg-border/40" />
      <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-border/40 bg-card px-3 py-1 text-[11px] text-muted-foreground/60">
        <SparklesIcon className="h-3 w-3 text-primary/50" />
        <span>{COMPACTION_LABEL[message.reason]}</span>
      </div>
      <div className="h-px flex-1 bg-border/40" />
    </div>
  )
}

export const MessageRow = memo(function MessageRow({
  message,
  commandsByName,
  showThinking,
  isNewMessage = true,
  entryDelayMs = 0,
  isLastInTurn = true,
  turnMessages,
  rootPath,
  onFork,
  onRevert,
  isReverting = false,
}: MessageRowProps) {
  const [isForking, setIsForking] = useState(false)
  const [confirmRevertOpen, setConfirmRevertOpen] = useState(false)

  if (message.role === "tool") {
    return (
      <ToolCallBlock
        msg={message}
        isNew={isNewMessage}
        entryDelayMs={entryDelayMs}
        rootPath={rootPath}
      />
    )
  }

  if (message.role === "abort") {
    return <AbortBlock message={message} />
  }

  if (message.role === "compaction") {
    return <CompactionBlock message={message as CompactionMessage} />
  }

  if (message.role === "user") {
    const userMsg = message as UserMessage
    const canFork = !!onFork && !!userMsg.id
    const canRevert = !!onRevert && !!userMsg.id

    const handleFork = async () => {
      if (!canFork || isForking) return
      setIsForking(true)
      try {
        await onFork(userMsg.id!)
      } finally {
        setIsForking(false)
      }
    }

    const handleConfirmRevert = async () => {
      if (!canRevert) return
      setConfirmRevertOpen(false)
      await onRevert(userMsg.id!)
    }

    return (
      <>
        <div
          className={cn(
            "group flex flex-col items-end gap-1.5 self-end",
            isNewMessage && "animate-chat-message-in"
          )}
          style={
            isNewMessage && entryDelayMs > 0
              ? { animationDelay: `${entryDelayMs}ms` }
              : undefined
          }
        >
          <div
            className="max-w-3/4 rounded-xl bg-muted/70 px-2 py-2 text-sm wrap-break-word whitespace-pre-wrap ring-1 ring-foreground/5"
            data-selectable
          >
            <UserMessageContent
              content={message.content}
              commandsByName={commandsByName}
            />
          </div>
          <div className="flex items-center gap-2">
            {canRevert && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setConfirmRevertOpen(true)}
                disabled={isReverting}
                aria-label="Revert conversation to before this message"
                className="opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
              >
                {isReverting ? <Loader2 className="animate-spin" /> : <Undo2 />}
              </Button>
            )}
            {canFork && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={handleFork}
                disabled={isForking}
                aria-label="Fork conversation from here"
                className="opacity-0 group-hover:opacity-100"
              >
                {isForking ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <GitForkIcon />
                )}
              </Button>
            )}
            <CopyButton text={message.content} />
            {userMsg.createdAt != null && (
              <TimeStamp timestamp={userMsg.createdAt} />
            )}
          </div>
        </div>

        <AlertDialog
          open={confirmRevertOpen}
          onOpenChange={setConfirmRevertOpen}
        >
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogMedia className="bg-destructive/10">
                <Undo2 className="text-destructive" />
              </AlertDialogMedia>
              <AlertDialogTitle>
                Revert to before this message?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This message and all subsequent conversation and code changes
                will be undone. The message text will be restored to your input
                box.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={handleConfirmRevert}
              >
                Revert
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    )
  }

  if (message.role === "error") return null

  return (
    <AssistantMessageBlock
      message={message}
      showThinking={showThinking}
      isNew={isNewMessage}
      entryDelayMs={entryDelayMs}
      isLastInTurn={isLastInTurn}
      turnMessages={turnMessages}
    />
  )
})
