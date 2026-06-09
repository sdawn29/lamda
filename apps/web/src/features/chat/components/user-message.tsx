import { FileTextIcon, ServerCrashIcon } from "lucide-react"
import { Icon } from "@iconify/react"

import { cn } from "@/shared/lib/utils"
import { getIconName } from "@/shared/ui/file-icon"
import type { SlashCommand } from "../api"
import { MessageChip } from "./message-chip"
import {
  FILE_CONTEXT_RE,
  parseFileCommentContext,
  type FileCommentContext,
} from "../lib/file-context"

const TOKEN_RE = /(@[^\s]+|\/[^\s]+)/g

function isFileMention(path: string): boolean {
  const basename = path.split("/").pop() ?? path
  // Dotfiles (.npmrc, .env, .gitignore) start with a dot — always a file
  if (basename.startsWith(".")) return true
  return basename.lastIndexOf(".") > 0
}

function FileChip({ filePath }: { filePath: string }) {
  const basename = filePath.split("/").pop() ?? filePath
  return (
    <MessageChip
      icon={
        <Icon
          icon={`catppuccin:${getIconName(basename)}`}
          data-icon="inline-start"
          aria-hidden
        />
      }
      label={basename}
      detail={
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
            File
          </span>
          <span className="font-mono text-xs break-all">{filePath}</span>
        </div>
      }
    />
  )
}

function FolderChip({ folderPath }: { folderPath: string }) {
  const normalized = folderPath.replace(/\/+$/, "")
  const basename = normalized.split("/").pop() || normalized
  return (
    <MessageChip
      icon={
        <Icon icon="catppuccin:folder" data-icon="inline-start" aria-hidden />
      }
      label={basename}
      detail={
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
            Folder
          </span>
          <span className="font-mono text-xs break-all">{normalized}</span>
        </div>
      }
    />
  )
}

function SlashCommandChip({ command }: { command: SlashCommand }) {
  const isSkill = command.source === "skill"
  // Skill commands carry a `skill:` prefix in their name — drop it for display
  // so the chip reads `/foo` rather than `/skill:foo`.
  const displayName = isSkill ? command.name.replace(/^skill:/, "") : command.name

  return (
    <MessageChip
      icon={
        isSkill ? (
          <ServerCrashIcon
            data-icon="inline-start"
            className="text-purple-500"
            aria-hidden
          />
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
                  ? "bg-purple-500/15 text-purple-500"
                  : "bg-foreground/10 text-foreground/60"
              )}
            >
              {isSkill ? (
                <ServerCrashIcon className="size-3.5" aria-hidden />
              ) : (
                <FileTextIcon className="size-3.5" aria-hidden />
              )}
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[9px] font-semibold tracking-[0.14em] text-foreground/45 uppercase">
                {isSkill ? "Skill" : "Prompt"}
              </span>
              <span className="truncate font-mono text-[11px] font-medium text-foreground">
                /{displayName}
              </span>
            </div>
          </div>
          {/* Description */}
          <div className="px-3 py-2.5">
            {command.description ? (
              <p className="text-[11px] leading-relaxed text-foreground/70">
                {command.description}
              </p>
            ) : (
              <p className="text-[11px] text-foreground/40 italic">
                No description available
              </p>
            )}
          </div>
        </>
      }
    />
  )
}

function FileContextChip({ context }: { context: FileCommentContext }) {
  const basename = context.path.split("/").pop() ?? context.path
  return (
    <MessageChip
      icon={
        <Icon
          icon={`catppuccin:${getIconName(basename)}`}
          data-icon="inline-start"
          aria-hidden
        />
      }
      label={basename}
      meta={`L${context.line}`}
      detailClassName="w-80 flex-col items-start gap-0 overflow-hidden p-0"
      detail={
        <>
          <div className="flex w-full items-center gap-2 border-b border-foreground/10 px-3 py-2.5">
            <Icon
              icon={`catppuccin:${getIconName(basename)}`}
              className="size-4 shrink-0"
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-[11px] font-medium">
                {context.path}
              </p>
              <p className="text-[10px] text-muted-foreground">
                Line {context.line} context
              </p>
            </div>
          </div>
          {context.code && (
            <pre className="max-h-20 w-full overflow-auto border-b border-foreground/10 bg-muted/40 px-3 py-2 font-mono text-[10px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
              {context.code}
            </pre>
          )}
          <p className="px-3 py-2.5 text-[11px] leading-relaxed text-foreground/80">
            {context.comment}
          </p>
        </>
      }
    />
  )
}

export function UserMessageContent({
  content,
  commandsByName,
}: {
  content: string
  commandsByName?: ReadonlyMap<string, SlashCommand>
}) {
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  let key = 0

  FILE_CONTEXT_RE.lastIndex = 0
  TOKEN_RE.lastIndex = 0

  const pushInlineTokens = (text: string) => {
    let tokenLastIndex = 0
    let tokenMatch: RegExpExecArray | null
    TOKEN_RE.lastIndex = 0
    while ((tokenMatch = TOKEN_RE.exec(text)) !== null) {
      const token = tokenMatch[0]
      const start = tokenMatch.index

      if (start > tokenLastIndex) {
        parts.push(text.slice(tokenLastIndex, start))
      }

      if (token.startsWith("@")) {
        const path = token.slice(1)
        parts.push(
          isFileMention(path) ? (
            <FileChip key={`token-${key++}`} filePath={path} />
          ) : (
            <FolderChip key={`token-${key++}`} folderPath={path} />
          )
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

  while ((match = FILE_CONTEXT_RE.exec(content)) !== null) {
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

  return <>{parts}</>
}
