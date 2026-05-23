import { FileTextIcon, TerminalIcon } from "lucide-react"
import { Icon } from "@iconify/react"

import { cn } from "@/shared/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/shared/ui/tooltip"
import { getIconName } from "@/shared/ui/file-icon"
import type { SlashCommand } from "../api"

const CHIP_BASE_CLASS =
  "mx-0.5 inline-flex items-center gap-1 rounded-md border border-border bg-background px-1.5 py-0.5 align-middle font-mono text-xs text-foreground/80 select-text"

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
    <TooltipProvider delay={500}>
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="inline-flex align-middle">
              <span className={CHIP_BASE_CLASS}>
                <Icon
                  icon={`catppuccin:${getIconName(basename)}`}
                  className="size-3.5 shrink-0"
                  aria-hidden
                />
                {basename}
              </span>
            </span>
          }
        />
        <TooltipContent side="top" align="start" sideOffset={8}>
          <span className="font-mono text-xs break-all">{filePath}</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function FolderChip({ folderPath }: { folderPath: string }) {
  const normalized = folderPath.replace(/\/+$/, "")
  const basename = normalized.split("/").pop() || normalized
  return (
    <TooltipProvider delay={500}>
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="inline-flex align-middle">
              <span className={CHIP_BASE_CLASS}>
                <Icon icon="catppuccin:folder" className="size-3.5 shrink-0" aria-hidden />
                {basename}
              </span>
            </span>
          }
        />
        <TooltipContent side="top" align="start" sideOffset={8}>
          <span className="font-mono text-xs break-all">{normalized}</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function SlashCommandChip({ command }: { command: SlashCommand }) {
  const isSkill = command.source === "skill"

  return (
    <TooltipProvider delay={500}>
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="inline-flex align-middle">
              <span className={CHIP_BASE_CLASS}>
                {isSkill ? (
                  <TerminalIcon className="size-3 shrink-0" aria-hidden />
                ) : (
                  <FileTextIcon className="size-3 shrink-0" aria-hidden />
                )}
                <span className="font-mono">/{command.name}</span>
              </span>
            </span>
          }
        />
        <TooltipContent
          side="top"
          align="start"
          sideOffset={8}
          className="w-64 flex-col items-start gap-0 overflow-hidden p-0"
        >
          {/* Header: icon badge + type label + command name */}
          <div className="flex items-center gap-2.5 border-b border-foreground/10 px-3 py-2.5">
            <div
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded",
                isSkill
                  ? "bg-primary/15 text-primary"
                  : "bg-foreground/10 text-foreground/60"
              )}
            >
              {isSkill ? (
                <TerminalIcon className="size-3.5" aria-hidden />
              ) : (
                <FileTextIcon className="size-3.5" aria-hidden />
              )}
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[9px] font-semibold tracking-[0.14em] text-foreground/45 uppercase">
                {isSkill ? "Skill" : "Prompt"}
              </span>
              <span className="truncate font-mono text-[11px] font-medium text-foreground">
                /{command.name}
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
              <p className="text-[11px] italic text-foreground/40">
                No description available
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
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

  while ((match = TOKEN_RE.exec(content)) !== null) {
    const token = match[0]
    const start = match.index

    if (start > lastIndex) {
      parts.push(content.slice(lastIndex, start))
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
      lastIndex = start + token.length
      continue
    }

    const hasBoundary = start === 0 || /\s/.test(content[start - 1] ?? "")
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
    lastIndex = start + token.length
  }

  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex))
  }

  return <>{parts}</>
}
