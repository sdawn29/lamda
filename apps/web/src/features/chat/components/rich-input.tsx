import * as React from "react"
import { FileTextIcon, TerminalIcon, type LucideIcon } from "lucide-react"
import { renderToStaticMarkup } from "react-dom/server"
import { getFileTypeColor } from "@/shared/lib/file-type-color"
import { badgeVariants } from "@/shared/ui/badge"
import { cn } from "@/shared/lib/utils"
import type { SlashCommand } from "../api"

const ZERO_WIDTH_SPACE_RE = /\u200B/g

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
        } else {
          walk(el.childNodes)
        }
      }
    }
  }

  walk(root.childNodes)
  return text.replace(ZERO_WIDTH_SPACE_RE, "")
}

function isRichInputEmpty(root: Node): boolean {
  return readRichInputValue(root).trim().length === 0
}

function hasFileExtension(p: string): boolean {
  const basename = p.replace(/\/+$/, "").split("/").pop() ?? p
  return basename.lastIndexOf(".") > 0
}

function buildChipBase(className: string): HTMLSpanElement {
  const chip = document.createElement("span")
  chip.contentEditable = "false"
  chip.className = cn(
    badgeVariants({ variant: "outline" }),
    "mx-0.5 h-5 gap-1 px-1.5 text-[9px] text-foreground select-none",
    className
  )
  return chip
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
  const chip = buildChipBase("border-primary/25 bg-primary/10 font-mono")
  chip.dataset.filePath = path
  chip.dataset.entryType = isDir ? "dir" : "file"
  const svgNS = "http://www.w3.org/2000/svg"
  const icon = document.createElementNS(svgNS, "svg")
  icon.setAttribute("xmlns", svgNS)
  icon.setAttribute("viewBox", "0 0 24 24")
  icon.setAttribute("width", "10")
  icon.setAttribute("height", "10")
  icon.setAttribute("fill", "none")
  icon.setAttribute("stroke-width", "2")
  icon.setAttribute("stroke-linecap", "round")
  icon.setAttribute("stroke-linejoin", "round")
  icon.style.flexShrink = "0"
  if (isDir) {
    icon.setAttribute("stroke", "#60a5fa")
    const folderPath = document.createElementNS(svgNS, "path")
    folderPath.setAttribute(
      "d",
      "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"
    )
    icon.appendChild(folderPath)
  } else {
    const color = getFileTypeColor(basename)
    icon.setAttribute("stroke", color)
    const filePath = document.createElementNS(svgNS, "path")
    filePath.setAttribute(
      "d",
      "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"
    )
    const fold = document.createElementNS(svgNS, "path")
    fold.setAttribute("d", "M14 2v4a2 2 0 0 0 2 2h4")
    icon.appendChild(filePath)
    icon.appendChild(fold)
  }
  chip.appendChild(icon)
  chip.appendChild(document.createTextNode(basename))
  return chip
}

export function buildSlashCommandChip(cmd: SlashCommand): HTMLSpanElement {
  const chip = buildChipBase(
    cmd.source === "skill"
      ? "rounded-full border-emerald-500/25 bg-emerald-500/10"
      : "rounded-full border-sky-500/25 bg-sky-500/10"
  )

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
          divRef.current.textContent = text
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
    const PASTE_MENTION_RE = /(@[^\s]+)/g
    const parts = text.split(PASTE_MENTION_RE)
    const sel = window.getSelection()
    if (!sel || !sel.rangeCount) return
    const range = sel.getRangeAt(0)
    range.deleteContents()
    const frag = document.createDocumentFragment()
    for (const part of parts) {
      if (part.startsWith("@")) {
        const path = part.slice(1)
        frag.appendChild(buildMentionChip(path))
        frag.appendChild(document.createTextNode("\u200B"))
      } else if (part) {
        frag.appendChild(document.createTextNode(part))
      }
    }
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
