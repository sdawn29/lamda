import { useMemo } from "react"
import { ContainerIcon, FileTextIcon } from "lucide-react"
import { Icon } from "@iconify/react"

import { cn } from "@/shared/lib/utils"
import { getIconName } from "@/shared/ui/file-icon"
import { SectionLabel } from "@/shared/ui/section-label"
import { openFileTab } from "@/features/dock"
import type { AgentDto } from "@/features/workspace/api"
import { attachmentUrl, type SlashCommand } from "../api"
import type { UserMessage } from "../types"
import { useFileChipRootPath } from "../file-chip-context"
import { FileChip, resolveAbsolutePath } from "./file-chip"
import { MessageChip } from "./message-chip"
import { colorStyle, resolveModeIcon } from "./mode-combobox"
import {
  AgentModelLine,
  AgentSourceBadge,
  AgentToolCountLine,
} from "./agent-info"
import {
  FILE_CONTEXT_RE,
  parseFileCommentContext,
  type FileCommentContext,
} from "../lib/file-context"

const TOKEN_RE = /(@[^\s]+|\/[^\s]+|#[a-z0-9][a-z0-9-]*)/gi

function isFileMention(path: string): boolean {
  const basename = path.split("/").pop() ?? path
  // Dotfiles (.npmrc, .env, .gitignore) start with a dot — always a file
  if (basename.startsWith(".")) return true
  return basename.lastIndexOf(".") > 0
}

function SlashCommandChip({ command }: { command: SlashCommand }) {
  const isSkill = command.source === "skill"
  // Skill commands carry a `skill:` prefix in their name — drop it for display
  // so the chip reads `/foo` rather than `/skill:foo`.
  const displayName = isSkill
    ? command.name.replace(/^skill:/, "")
    : command.name

  return (
    <MessageChip
      className={
        isSkill
          ? "bg-purple-500/10! text-purple-700 hover:bg-purple-500/15! dark:bg-purple-500/15! dark:text-purple-300 dark:hover:bg-purple-500/20!"
          : undefined
      }
      icon={
        isSkill ? (
          <ContainerIcon data-icon="inline-start" aria-hidden />
        ) : (
          <FileTextIcon data-icon="inline-start" aria-hidden />
        )
      }
      label={<span className="font-mono">/{displayName}</span>}
      detailClassName="w-64 flex-col items-start gap-0 overflow-hidden p-0"
      detail={
        <>
          {/* Header: icon badge + type label + command name */}
          <div className="flex items-center gap-2.5 border-b border-foreground/10 px-3 py-2.5">
            <div
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded",
                isSkill
                  ? "bg-purple-500/15 text-purple-600 dark:text-purple-400"
                  : "bg-foreground/10 text-foreground/60"
              )}
            >
              {isSkill ? (
                <ContainerIcon className="size-3.5" aria-hidden />
              ) : (
                <FileTextIcon className="size-3.5" aria-hidden />
              )}
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <SectionLabel>{isSkill ? "Skill" : "Prompt"}</SectionLabel>
              <span className="truncate font-mono text-2xs font-medium text-foreground">
                /{displayName}
              </span>
            </div>
          </div>
          {/* Description */}
          <div className="px-3 py-2.5">
            {command.description ? (
              <p className="text-2xs leading-relaxed text-foreground/70">
                {command.description}
              </p>
            ) : (
              <p className="text-2xs text-foreground/40 italic">
                No description available
              </p>
            )}
          </div>
        </>
      }
    />
  )
}

function AgentChip({ agent }: { agent: AgentDto }) {
  const visual = useMemo(
    () => ({ Icon: resolveModeIcon(agent.icon) }),
    [agent.icon]
  )
  const style = colorStyle(agent.color)
  return (
    <MessageChip
      className={cn(style.softBg, style.iconAccent)}
      icon={<visual.Icon data-icon="inline-start" aria-hidden />}
      label={<span className="font-mono">{agent.label}</span>}
      detailClassName="w-64 flex-col items-start gap-1.5"
      detail={
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <SectionLabel>Subagent</SectionLabel>
            <AgentSourceBadge source={agent.source} className="ml-auto" />
          </div>
          <AgentModelLine model={agent.model} />
          <AgentToolCountLine tools={agent.tools} />
          {agent.description && (
            <span className="text-xs leading-relaxed">{agent.description}</span>
          )}
        </div>
      }
    />
  )
}

function FileContextChip({ context }: { context: FileCommentContext }) {
  const rootPath = useFileChipRootPath()
  const basename = context.path.split("/").pop() ?? context.path
  const rangeLabel =
    context.startColumn && context.endColumn
      ? `L${context.line}:C${context.startColumn}-L${context.endLine ?? context.line}:C${context.endColumn}`
      : `L${context.line}-L${context.endLine ?? context.line}`
  const hideCommentRow =
    !!context.code && context.code.trim() === context.comment.trim()

  function handleClick() {
    openFileTab({
      filePath: resolveAbsolutePath(context.path, rootPath),
      title: basename,
      workspacePath: rootPath,
      scrollToLine: context.line,
    })
  }

  return (
    <MessageChip
      onClick={handleClick}
      icon={
        <Icon
          icon={`catppuccin:${getIconName(basename)}`}
          data-icon="inline-start"
          aria-hidden
        />
      }
      label={basename}
      meta={rangeLabel}
      detailClassName="w-80 max-w-[calc(100vw-2rem)] flex-col items-stretch gap-0 overflow-hidden p-0"
      detail={
        <>
          {/* Header mirrors the file chip hover card (file-chip.tsx). */}
          <div className="flex w-full items-center gap-2.5 border-b border-foreground/10 px-3 py-2.5">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-foreground/5">
              <Icon
                icon={`catppuccin:${getIconName(basename)}`}
                className="size-4"
                aria-hidden
              />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-xs font-medium">{basename}</span>
              <span className="font-mono text-3xs leading-snug break-all text-muted-foreground">
                {context.path}
              </span>
            </div>
          </div>
          <div className="flex w-full items-center gap-1.5 border-b border-foreground/10 px-3 py-1.5 text-3xs text-muted-foreground">
            <span className="font-medium text-foreground/70">Selection</span>
            <span className="text-muted-foreground/40">·</span>
            <span className="font-mono">{rangeLabel}</span>
          </div>
          {context.code && (
            <pre className="max-h-24 w-full overflow-auto bg-muted/30 px-3 py-2 font-mono text-2xs leading-relaxed whitespace-pre-wrap text-foreground/75">
              {context.code}
            </pre>
          )}
          {!hideCommentRow && (
            <p className="border-t border-foreground/10 px-3 py-2.5 text-2xs leading-relaxed text-foreground/80">
              {context.comment}
            </p>
          )}
          <div className="w-full border-t border-foreground/10 bg-muted/40 px-3 py-1.5 text-3xs text-muted-foreground">
            Click to open in review panel
          </div>
        </>
      }
    />
  )
}

function AttachmentList({
  attachments,
  threadId,
}: {
  attachments: NonNullable<UserMessage["attachments"]>
  threadId?: string
}) {
  const srcFor = (a: NonNullable<UserMessage["attachments"]>[number]) =>
    a.dataUrl ?? (threadId ? attachmentUrl(threadId, a.id) : undefined)

  // Open the attachment in the review-panel file viewer (right sidebar).
  const openInViewer = (
    a: NonNullable<UserMessage["attachments"]>[number],
    src: string
  ) => {
    openFileTab({
      filePath: a.filename,
      title: a.filename,
      sourceUrl: src,
    })
  }

  return (
    <div className="mb-1.5 flex flex-wrap gap-1.5">
      {attachments.map((attachment) => {
        const src = srcFor(attachment)
        if (attachment.kind === "image" && src) {
          return (
            <button
              key={attachment.id}
              type="button"
              onClick={() => openInViewer(attachment, src)}
              className="block cursor-pointer overflow-hidden rounded-lg border border-foreground/10 transition-opacity hover:opacity-90"
            >
              <img
                src={src}
                alt={attachment.filename}
                className="max-h-40 max-w-[200px] object-cover"
              />
            </button>
          )
        }
        return (
          <button
            key={attachment.id}
            type="button"
            disabled={!src}
            onClick={() => src && openInViewer(attachment, src)}
            className="flex cursor-pointer items-center gap-1.5 rounded-md border border-foreground/10 bg-foreground/5 px-2 py-1 text-xs text-foreground/80 hover:bg-foreground/10 disabled:cursor-default disabled:opacity-60"
          >
            <FileTextIcon className="size-3.5 shrink-0" aria-hidden />
            <span className="max-w-[160px] truncate font-medium">
              {attachment.filename}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function UserMessageContent({
  content,
  commandsByName,
  agentsById,
  attachments,
  threadId,
}: {
  content: string
  commandsByName?: ReadonlyMap<string, SlashCommand>
  agentsById?: ReadonlyMap<string, AgentDto>
  attachments?: UserMessage["attachments"]
  threadId?: string
}) {
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  let key = 0

  // Local copies — FILE_CONTEXT_RE/TOKEN_RE are module-scoped `g` regexes, and
  // mutating their shared `.lastIndex` from render would step on any other
  // concurrent match (e.g. another instance of this component rendering, or
  // rich-input.tsx's own use of FILE_CONTEXT_RE).
  const fileContextRe = new RegExp(FILE_CONTEXT_RE)
  const tokenRe = new RegExp(TOKEN_RE)

  const pushInlineTokens = (text: string) => {
    let tokenLastIndex = 0
    let tokenMatch: RegExpExecArray | null
    tokenRe.lastIndex = 0
    while ((tokenMatch = tokenRe.exec(text)) !== null) {
      const token = tokenMatch[0]
      const start = tokenMatch.index

      if (start > tokenLastIndex) {
        parts.push(text.slice(tokenLastIndex, start))
      }

      if (token.startsWith("@")) {
        const path = token.slice(1)
        // Only files get a chip; folder mentions render as plain text.
        parts.push(
          isFileMention(path) ? (
            <FileChip key={`token-${key++}`} path={path} />
          ) : (
            token
          )
        )
        tokenLastIndex = start + token.length
        continue
      }

      if (token.startsWith("#")) {
        const agent = agentsById?.get(token.slice(1))
        parts.push(
          agent ? <AgentChip key={`token-${key++}`} agent={agent} /> : token
        )
        tokenLastIndex = start + token.length
        continue
      }

      const hasBoundary = start === 0 || /\s/.test(text[start - 1] ?? "")
      const command = hasBoundary
        ? commandsByName?.get(token.slice(1))
        : undefined

      parts.push(
        command ? (
          <SlashCommandChip key={`token-${key++}`} command={command} />
        ) : (
          token
        )
      )
      tokenLastIndex = start + token.length
    }

    if (tokenLastIndex < text.length) {
      parts.push(text.slice(tokenLastIndex))
    }
  }

  while ((match = fileContextRe.exec(content)) !== null) {
    if (match.index > lastIndex) {
      pushInlineTokens(content.slice(lastIndex, match.index))
    }

    parts.push(
      <FileContextChip
        key={`context-${key++}`}
        context={parseFileCommentContext(match)}
      />
    )
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < content.length) {
    pushInlineTokens(content.slice(lastIndex))
  }

  return (
    <>
      {attachments && attachments.length > 0 && (
        <AttachmentList attachments={attachments} threadId={threadId} />
      )}
      {parts}
    </>
  )
}
