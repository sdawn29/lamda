import { useEffect, useRef, useCallback, useState, memo } from "react"
import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import { X, GripHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useTerminal } from "@/hooks/terminal-context"
import "@xterm/xterm/css/xterm.css"

const SERVER_URL =
  (import.meta.env.VITE_SERVER_URL as string | undefined) ??
  "http://localhost:3001"

function wsUrl(path: string): string {
  return SERVER_URL.replace(/^http/, "ws") + path
}

const MIN_HEIGHT = 120
const DEFAULT_HEIGHT = 260
const MIN_CONTENT_HEIGHT = 200

interface TerminalPanelProps {
  cwd: string
}

export const TerminalPanel = memo(function TerminalPanel({
  cwd,
}: TerminalPanelProps) {
  const { close } = useTerminal()
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(DEFAULT_HEIGHT)
  const dragStartRef = useRef<{ y: number; h: number } | null>(null)

  // Initialize xterm + WebSocket once
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: '"Menlo", "Monaco", "Courier New", monospace',
      theme: {
        background: "#101010",
        foreground: "#c8c8c8",
        cursor: "#7898b0",
        selectionBackground: "#7898b028",
        black: "#171717",
        red: "#c86858",
        green: "#7a9a5a",
        yellow: "#c8a848",
        blue: "#7898b8",
        magenta: "#a898c8",
        cyan: "#7898b0",
        white: "#c8c8c8",
        brightBlack: "#686868",
        brightRed: "#d87868",
        brightGreen: "#90b070",
        brightYellow: "#d8b858",
        brightBlue: "#98b0d0",
        brightMagenta: "#c0b0d8",
        brightCyan: "#98b0c8",
        brightWhite: "#d8d8d8",
      },
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(container)
    fitAddon.fit()

    termRef.current = term
    fitAddonRef.current = fitAddon

    const url = wsUrl(`/terminal?cwd=${encodeURIComponent(cwd)}`)
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      const dims = fitAddon.proposeDimensions()
      if (dims) {
        ws.send(
          JSON.stringify({ type: "resize", cols: dims.cols, rows: dims.rows })
        )
      }
    }

    ws.onmessage = (e) => {
      term.write(e.data as string)
    }

    ws.onclose = () => {
      term.write("\r\n\x1b[31m[disconnected]\x1b[0m\r\n")
    }

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "input", data }))
      }
    })

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit()
      const dims = fitAddon.proposeDimensions()
      if (dims && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({ type: "resize", cols: dims.cols, rows: dims.rows })
        )
      }
    })
    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
      ws.close()
      term.dispose()
      termRef.current = null
      fitAddonRef.current = null
      wsRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cwd])

  // Re-fit when height changes
  useEffect(() => {
    const fitAddon = fitAddonRef.current
    const ws = wsRef.current
    if (!fitAddon) return
    fitAddon.fit()
    const dims = fitAddon.proposeDimensions()
    if (dims && ws?.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({ type: "resize", cols: dims.cols, rows: dims.rows })
      )
    }
  }, [height])

  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      dragStartRef.current = { y: e.clientY, h: height }
      document.body.style.userSelect = "none"
      document.body.style.cursor = "row-resize"

      const onMove = (ev: MouseEvent) => {
        if (!dragStartRef.current) return
        const delta = dragStartRef.current.y - ev.clientY
        const parentHeight =
          panelRef.current?.parentElement?.clientHeight ?? window.innerHeight
        const maxHeight = parentHeight - MIN_CONTENT_HEIGHT
        setHeight(
          Math.max(
            MIN_HEIGHT,
            Math.min(maxHeight, dragStartRef.current.h + delta)
          )
        )
      }

      const onUp = () => {
        dragStartRef.current = null
        document.body.style.userSelect = ""
        document.body.style.cursor = ""
        window.removeEventListener("mousemove", onMove)
        window.removeEventListener("mouseup", onUp)
      }

      window.addEventListener("mousemove", onMove)
      window.addEventListener("mouseup", onUp)
    },
    [height]
  )

  return (
    <div
      ref={panelRef}
      className="flex shrink-0 flex-col border-t bg-background"
      style={{ height, maxHeight: "80%" }}
    >
      {/* Drag handle / header */}
      <div
        className="flex h-8 shrink-0 cursor-row-resize items-center justify-between border-b border-zinc-800 px-3 select-none"
        onMouseDown={onDragStart}
      >
        <div className="flex items-center gap-2">
          <GripHorizontal className="h-3 w-3 text-zinc-600" />
          <span className="font-mono text-xs text-zinc-500">terminal</span>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          className="h-5 w-5 text-zinc-500 hover:text-zinc-300"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={close}
        >
          <X className="h-3 w-3" />
          <span className="sr-only">Close terminal</span>
        </Button>
      </div>

      {/* xterm container */}
      <div
        ref={containerRef}
        className="min-h-0 flex-1 overflow-hidden px-2 py-1"
      />
    </div>
  )
})
