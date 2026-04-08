import * as React from "react"
import { getFileTypeColor } from "@/lib/file-type-color"

export interface RichInputHandle {
  getValue: () => string
  clear: () => void
  focus: () => void
}

export interface AtMention {
  filter: string
  textNode: Text
  startOffset: number
}

function hasFileExtension(p: string): boolean {
  const basename = p.replace(/\/+$/, "").split("/").pop() ?? p
  return basename.lastIndexOf(".") > 0
}

export function buildMentionChip(path: string): HTMLSpanElement {
  const isDir = !hasFileExtension(path)
  const basename = path.replace(/\/+$/, "").split("/").pop() ?? path
  const chip = document.createElement("span")
  chip.contentEditable = "false"
  chip.dataset.filePath = path
  chip.dataset.entryType = isDir ? "dir" : "file"
  chip.className =
    "inline-flex items-center gap-1 rounded border border-primary/30 bg-primary/10 text-foreground text-[10px] px-1 py-px mx-0.5 select-none font-medium font-mono"
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

export const RichInput = React.forwardRef<
  RichInputHandle,
  {
    placeholder: string
    mentionActive: boolean
    onAtMentionChange: (mention: AtMention | null) => void
    onSend: () => void
    onMentionEnter: () => void
    onArrowUp: () => void
    onArrowDown: () => void
    onEscape: () => void
    onInput: () => void
  }
>(function RichInput(
  {
    placeholder,
    mentionActive,
    onAtMentionChange,
    onSend,
    onMentionEnter,
    onArrowUp,
    onArrowDown,
    onEscape,
    onInput,
  },
  ref
) {
  const divRef = React.useRef<HTMLDivElement>(null)

  React.useImperativeHandle(ref, () => ({
    getValue() {
      if (!divRef.current) return ""
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
            } else {
              walk(el.childNodes)
            }
          }
        }
      }
      walk(divRef.current.childNodes)
      return text
    },
    clear() {
      if (divRef.current) divRef.current.innerHTML = ""
    },
    focus() {
      divRef.current?.focus()
    },
  }))

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

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (mentionActive) {
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
          prev.dataset.filePath !== undefined
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
          (prevNode as HTMLElement).dataset?.filePath !== undefined
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
      data-placeholder={placeholder}
      suppressContentEditableWarning
      onKeyDown={handleKeyDown}
      onInput={handleInput}
      onPaste={handlePaste}
      className="rich-input min-h-20 max-h-48 overflow-y-auto w-full cursor-text bg-transparent text-sm leading-relaxed outline-none"
    />
  )
})
