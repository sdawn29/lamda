import * as React from "react"
import { FileTextIcon, TerminalIcon, type LucideIcon } from "lucide-react"
import { renderToStaticMarkup } from "react-dom/server"
import { getIconName, buildCatppuccinSvgElement } from "@/shared/ui/file-icon"
import { cn } from "@/shared/lib/utils"
import type { SlashCommand } from "../api"
import {
  FILE_CONTEXT_RE,
  formatFileCommentContext,
  parseFileCommentContext,
  type FileCommentContext,
} from "../lib/file-context"

const ZERO_WIDTH_SPACE_RE = /\u200B/g
const NBSP_RE = /\u00A0/g
const PASTE_MENTION_RE = /(@[^\s]+)/g

export interface RichInputHandle {
  getValue: () => string
  setValue: (text: string) => void
  clear: () => void
  focus: () => void
}

export interface AtMention {
  filter: string
  textNode: Text
  startOffset: number
}

export interface SlashMention {
  filter: string
  textNode: Text
  startOffset: number
}

function readRichInputValue(root: Node): string {
  let text = ""
  const walk = (nodes: NodeListOf<ChildNode>) => {
    for (const node of nodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent ?? ""
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement
        if (el.tagName === "BR") {
          text += "\n"
        } else if (el.dataset.filePath) {
          text += `@${el.dataset.filePath}`
        } else if (el.dataset.commandName) {
          text += `/${el.dataset.commandName}`
        } else if (el.dataset.contextPath && el.dataset.contextLine) {
          text += formatFileCommentContext({
            path: el.dataset.contextPath,
            line: Number(el.dataset.contextLine),
            comment: el.dataset.contextComment ?? "",
            code: el.dataset.contextCode,
          })
        } else {
          walk(el.childNodes)
        }
      }
    }
  }

  walk(root.childNodes)
  return text.replace(ZERO_WIDTH_SPACE_RE, "").replace(NBSP_RE, " ")
}

function isRichInputEmpty(root: Node): boolean {
  return readRichInputValue(root).trim().length === 0
}

function hasFileExtension(p: string): boolean {
  const basename = p.replace(/\/+$/, "").split("/").pop() ?? p
  // Dotfiles (.npmrc, .env, .gitignore) start with a dot — always a file
  if (basename.startsWith(".")) return true
  return basename.lastIndexOf(".") > 0
}

const CHIP_CLASS =
  "mx-0.5 inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-border bg-input/20 px-2 py-0.5 align-middle text-[0.625rem] font-medium whitespace-nowrap text-foreground/80 select-none dark:bg-input/30 [&>svg]:pointer-events-none [&>svg]:size-2.5!"

function buildChipBase(className?: string): HTMLSpanElement {
  const chip = document.createElement("span")
  chip.contentEditable = "false"
  chip.className = cn(CHIP_CLASS, className)
  return chip
}

function buildIconifyIcon(iconName: string): SVGSVGElement {
  return buildCatppuccinSvgElement(iconName, "size-3.5 shrink-0")
}

function buildLucideIcon(Icon: LucideIcon): SVGSVGElement {
  const template = document.createElement("template")
  template.innerHTML = renderToStaticMarkup(
    <Icon aria-hidden size={12} strokeWidth={2} className="shrink-0" />
  )

  return template.content.firstElementChild as SVGSVGElement
}

function buildSlashCommandIcon(source: SlashCommand["source"]): SVGSVGElement {
  return buildLucideIcon(source === "skill" ? TerminalIcon : FileTextIcon)
}

export function buildMentionChip(path: string): HTMLSpanElement {
  const isDir = !hasFileExtension(path)
  const basename = path.replace(/\/+$/, "").split("/").pop() ?? path
  const chip = buildChipBase()
  chip.dataset.filePath = path
  chip.dataset.entryType = isDir ? "dir" : "file"
  const iconName = isDir ? "folder" : getIconName(basename)
  chip.appendChild(buildIconifyIcon(iconName))
  chip.appendChild(document.createTextNode(basename))
  return chip
}

export function buildSlashCommandChip(cmd: SlashCommand): HTMLSpanElement {
  const chip = buildChipBase()

  const name = document.createElement("span")
  name.className = "font-mono"
  name.textContent = `/${cmd.name}`

  chip.dataset.commandName = cmd.name
  chip.dataset.commandSource = cmd.source
  if (cmd.description) {
    chip.dataset.commandDescription = cmd.description
  }
  chip.title = [
    cmd.source === "skill" ? "Skill" : "Prompt",
    `/${cmd.name}`,
    cmd.description,
  ]
    .filter(Boolean)
    .join("\n")

  chip.append(buildSlashCommandIcon(cmd.source), name)
  return chip
}

function buildFileContextChip(context: FileCommentContext): HTMLSpanElement {
  const basename = context.path.split("/").pop() ?? context.path
  const chip = buildChipBase(
    "rounded-full border-border bg-input/20 text-foreground/80 dark:bg-input/30"
  )
  chip.dataset.contextPath = context.path
  chip.dataset.contextLine = String(context.line)
  chip.dataset.contextComment = context.comment
  if (context.code) chip.dataset.contextCode = context.code
  chip.title = `${context.path}:${context.line}\n${context.comment}`
  const line = document.createElement("span")
  line.className = "font-mono text-[10px] uppercase tracking-wide opacity-70"
  line.textContent = `L${context.line}`
  chip.append(
    buildIconifyIcon(getIconName(basename)),
    document.createTextNode(basename),
    line
  )
  return chip
}

function appendMentionsFromPlainText(target: Node, text: string) {
  const parts = text.split(PASTE_MENTION_RE)
  for (const part of parts) {
    if (part.startsWith("@")) {
      const path = part.slice(1)
      target.appendChild(buildMentionChip(path))
      target.appendChild(document.createTextNode("\u200B"))
    } else if (part) {
      const lines = part.split("\n")
      for (let i = 0; i < lines.length; i++) {
        if (i > 0) {
          target.appendChild(document.createElement("br"))
        }
        if (lines[i]) {
          target.appendChild(document.createTextNode(lines[i]))
        }
      }
    }
  }
}

function appendRichTextFromPlainText(target: Node, text: string) {
  FILE_CONTEXT_RE.lastIndex = 0
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = FILE_CONTEXT_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      appendMentionsFromPlainText(target, text.slice(lastIndex, match.index))
    }
    target.appendChild(buildFileContextChip(parseFileCommentContext(match)))
    target.appendChild(document.createTextNode("\u200B"))
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    appendMentionsFromPlainText(target, text.slice(lastIndex))
  }
}

export const RichInput = React.forwardRef<
  RichInputHandle,
  {
    placeholder: string
    mentionActive: boolean
    slashActive: boolean
    onAtMentionChange: (mention: AtMention | null) => void
    onSlashMentionChange: (mention: SlashMention | null) => void
    onSend: () => void
    onMentionEnter: () => void
    onSlashEnter: () => void
    onArrowUp: () => void
    onArrowDown: () => void
    onEscape: () => void
    onInput: () => void
  }
>(function RichInput(
  {
    placeholder,
    mentionActive,
    slashActive,
    onAtMentionChange,
    onSlashMentionChange,
    onSend,
    onMentionEnter,
    onSlashEnter,
    onArrowUp,
    onArrowDown,
    onEscape,
    onInput,
  },
  ref
) {
  const divRef = React.useRef<HTMLDivElement>(null)

  const syncEmptyState = React.useCallback(() => {
    const div = divRef.current
    if (!div) return
    div.dataset.empty = String(isRichInputEmpty(div))
  }, [])

  React.useEffect(() => {
    const div = divRef.current
    if (!div) return

    syncEmptyState()

    const observer = new MutationObserver(() => {
      syncEmptyState()
    })

    observer.observe(div, {
      childList: true,
      subtree: true,
      characterData: true,
    })

    return () => {
      observer.disconnect()
    }
  }, [syncEmptyState])

  React.useImperativeHandle(
    ref,
    () => ({
      getValue() {
        if (!divRef.current) return ""
        return readRichInputValue(divRef.current)
      },
      setValue(text: string) {
        if (divRef.current) {
          divRef.current.innerHTML = ""
          appendRichTextFromPlainText(divRef.current, text)
          syncEmptyState()
          onInput?.()
          divRef.current.focus()
          const range = document.createRange()
          range.selectNodeContents(divRef.current)
          range.collapse(false)
          window.getSelection()?.removeAllRanges()
          window.getSelection()?.addRange(range)
        }
      },
      clear() {
        if (divRef.current) {
          divRef.current.innerHTML = ""
          syncEmptyState()
        }
      },
      focus() {
        divRef.current?.focus()
      },
    }),
    [onInput, syncEmptyState]
  )

  function detectAtMention() {
    const div = divRef.current
    if (!div) {
      onAtMentionChange(null)
      return
    }
    const sel = window.getSelection()
    if (!sel || !sel.rangeCount) {
      onAtMentionChange(null)
      return
    }
    const range = sel.getRangeAt(0)
    if (!range.collapsed) {
      onAtMentionChange(null)
      return
    }
    const { startContainer, startOffset } = range
    if (
      startContainer.nodeType !== Node.TEXT_NODE ||
      !div.contains(startContainer)
    ) {
      onAtMentionChange(null)
      return
    }
    const text = startContainer.textContent ?? ""
    const beforeCaret = text.slice(0, startOffset)
    const lastAt = beforeCaret.lastIndexOf("@")
    if (lastAt === -1) {
      onAtMentionChange(null)
      return
    }
    const between = beforeCaret.slice(lastAt + 1)
    if (/\s/.test(between)) {
      onAtMentionChange(null)
      return
    }
    onAtMentionChange({
      filter: between,
      textNode: startContainer as Text,
      startOffset: lastAt,
    })
  }

  function detectSlashCommand() {
    const div = divRef.current
    if (!div) {
      onSlashMentionChange(null)
      return
    }
    const sel = window.getSelection()
    if (!sel || !sel.rangeCount) {
      onSlashMentionChange(null)
      return
    }
    const range = sel.getRangeAt(0)
    if (!range.collapsed) {
      onSlashMentionChange(null)
      return
    }
    const { startContainer, startOffset } = range
    if (
      startContainer.nodeType !== Node.TEXT_NODE ||
      !div.contains(startContainer)
    ) {
      onSlashMentionChange(null)
      return
    }
    const text = startContainer.textContent ?? ""
    const beforeCaret = text.slice(0, startOffset)
    const lastSlash = beforeCaret.lastIndexOf("/")
    if (lastSlash === -1) {
      onSlashMentionChange(null)
      return
    }
    const between = beforeCaret.slice(lastSlash + 1)
    if (/\s/.test(between)) {
      onSlashMentionChange(null)
      return
    }
    onSlashMentionChange({
      filter: between,
      textNode: startContainer as Text,
      startOffset: lastSlash,
    })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (slashActive) {
      if (e.key === "ArrowUp") {
        e.preventDefault()
        onArrowUp()
        return
      }
      if (e.key === "ArrowDown") {
        e.preventDefault()
        onArrowDown()
        return
      }
      if (e.key === "Escape") {
        e.preventDefault()
        onEscape()
        return
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault()
        onSlashEnter()
        return
      }
    } else if (mentionActive) {
      if (e.key === "ArrowUp") {
        e.preventDefault()
        onArrowUp()
        return
      }
      if (e.key === "ArrowDown") {
        e.preventDefault()
        onArrowDown()
        return
      }
      if (e.key === "Escape") {
        e.preventDefault()
        onEscape()
        return
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault()
        onMentionEnter()
        return
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      onSend()
      return
    }

    // Backspace: delete the preceding chip in one keystroke
    if (e.key === "Backspace") {
      const div = divRef.current
      if (!div) return
      const sel = window.getSelection()
      if (!sel || !sel.rangeCount) return
      const range = sel.getRangeAt(0)
      if (!range.collapsed) return
      const { startContainer, startOffset } = range
      if (startContainer.nodeType === Node.TEXT_NODE && startOffset === 0) {
        const prev = (startContainer as Text).previousSibling
        if (
          prev instanceof HTMLElement &&
          (prev.dataset.filePath !== undefined ||
            prev.dataset.commandName !== undefined)
        ) {
          e.preventDefault()
          prev.remove()
          onInput()
          return
        }
      }
      if (startContainer === div && startOffset > 0) {
        const prevNode = div.childNodes[startOffset - 1]
        if (
          prevNode instanceof HTMLElement &&
          ((prevNode as HTMLElement).dataset?.filePath !== undefined ||
            (prevNode as HTMLElement).dataset?.commandName !== undefined)
        ) {
          e.preventDefault()
          prevNode.remove()
          onInput()
          return
        }
      }
    }
  }

  function handleInput() {
    detectAtMention()
    detectSlashCommand()
    syncEmptyState()
    onInput()
  }

  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    e.preventDefault()
    const text = e.clipboardData.getData("text/plain")
    if (!text) return
    const sel = window.getSelection()
    if (!sel || !sel.rangeCount) return
    const range = sel.getRangeAt(0)
    range.deleteContents()
    const frag = document.createDocumentFragment()
    appendRichTextFromPlainText(frag, text)
    range.insertNode(frag)
    range.collapse(false)
    sel.removeAllRanges()
    sel.addRange(range)
    onInput()
  }

  return (
    <div
      ref={divRef}
      contentEditable
      role="textbox"
      aria-multiline="true"
      aria-label={placeholder}
      data-empty="true"
      data-placeholder={placeholder}
      suppressContentEditableWarning
      onKeyDown={handleKeyDown}
      onInput={handleInput}
      onPaste={handlePaste}
      className="rich-input max-h-48 min-h-12 w-full cursor-text overflow-y-auto bg-transparent text-sm leading-relaxed outline-none"
    />
  )
})
