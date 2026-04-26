import { useEffect, useRef, memo } from "react"
import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import { Plus, Trash2, X, TerminalSquare } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { useTheme } from "@/shared/components/theme-provider"
import { useTerminal } from "../context"
import { getServerUrl } from "@/shared/lib/client"
import { cn } from "@/shared/lib/utils"
import "@xterm/xterm/css/xterm.css"

const TERMINAL_OUTPUT_FLUSH_MS = 16
const TERMINAL_IMMEDIATE_FLUSH_THRESHOLD = 8_192

const DARK_TERMINAL_THEME = {
  background: "#101010",
  foreground: "#c8c8c8",
  cursor: "#1e6ef4",
  cursorAccent: "#101010",
  selectionBackground: "#1e6ef428",
  black: "#171717",
  red: "#c86858",
  green: "#7a9a5a",
  yellow: "#c8a848",
  blue: "#1e6ef4",
  magenta: "#a898c8",
  cyan: "#4d8cf6",
  white: "#c8c8c8",
  brightBlack: "#686868",
  brightRed: "#d87868",
  brightGreen: "#90b070",
  brightYellow: "#d8b858",
  brightBlue: "#7ca9ff",
  brightMagenta: "#c0b0d8",
  brightCyan: "#9bc3ff",
  brightWhite: "#d8d8d8",
}

const LIGHT_TERMINAL_THEME = {
  background: "#f5f5f0",
  foreground: "#1a1a1a",
  cursor: "#1e6ef4",
  cursorAccent: "#f5f5f0",
  selectionBackground: "#1e6ef428",
  black: "#1a1a1a",
  red: "#b84838",
  green: "#6a8a4a",
  yellow: "#b89838",
  blue: "#1e6ef4",
  magenta: "#8878a8",
  cyan: "#5a7a92",
  white: "#d8d8d4",
  brightBlack: "#6a6a6a",
  brightRed: "#c86858",
  brightGreen: "#7a9a5a",
  brightYellow: "#c8a848",
  brightBlue: "#4d8cf6",
  brightMagenta: "#a898c8",
  brightCyan: "#7898b0",
  brightWhite: "#ffffff",
}

// ─── Single terminal instance (keeps mounted when inactive for session persistence) ───

interface TerminalInstanceProps {
  id: string
  cwd: string
  isActive: boolean
  onTitleChange: (id: string, title: string) => void
}

const TerminalInstance = memo(function TerminalInstance({
  id,
  cwd,
  isActive,
  onTitleChange,
}: TerminalInstanceProps) {
  const { resolvedTheme } = useTheme()
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const terminalTheme =
    resolvedTheme === "dark" ? DARK_TERMINAL_THEME : LIGHT_TERMINAL_THEME

  // Mount xterm + WebSocket once
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 12,
      fontFamily:
        '"JetBrains Mono", "Menlo", "Monaco", "Courier New", monospace',
      scrollback: 100,
      theme: document.documentElement.classList.contains("dark")
        ? DARK_TERMINAL_THEME
        : LIGHT_TERMINAL_THEME,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(container)
    fitAddon.fit()

    termRef.current = term
    fitAddonRef.current = fitAddon

    term.onTitleChange((title) => {
      if (title) onTitleChange(id, title)
    })

    let cancelled = false
    let ws: WebSocket | null = null
    let pendingOutput = ""
    let flushTimeout: number | null = null

    const flushOutput = () => {
      flushTimeout = null
      if (!pendingOutput) return
      term.write(pendingOutput)
      pendingOutput = ""
    }

    const scheduleFlush = (delay = TERMINAL_OUTPUT_FLUSH_MS) => {
      if (flushTimeout !== null) {
        if (delay !== 0) return
        window.clearTimeout(flushTimeout)
      }
      flushTimeout = window.setTimeout(flushOutput, delay)
    }

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit()
      const dims = fitAddon.proposeDimensions()
      if (dims && ws?.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({ type: "resize", cols: dims.cols, rows: dims.rows })
        )
      }
    })
    resizeObserver.observe(container)

    getServerUrl().then((serverUrl) => {
      if (cancelled) return
      const wsBase = serverUrl.replace(/^http/, "ws")
      const url = `${wsBase}/terminal?cwd=${encodeURIComponent(cwd)}`
      ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        const dims = fitAddon.proposeDimensions()
        if (dims) {
          ws!.send(
            JSON.stringify({ type: "resize", cols: dims.cols, rows: dims.rows })
          )
        }
      }

      ws.onmessage = (e) => {
        if (typeof e.data !== "string") return
        pendingOutput += e.data
        scheduleFlush(
          pendingOutput.length >= TERMINAL_IMMEDIATE_FLUSH_THRESHOLD
            ? 0
            : undefined
        )
      }

      ws.onclose = () => {
        if (pendingOutput) flushOutput()
        term.write("\r\n\x1b[31m[disconnected]\x1b[0m\r\n")
      }

      term.onData((data) => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "input", data }))
        }
      })
    })

    return () => {
      cancelled = true
      if (flushTimeout !== null) window.clearTimeout(flushTimeout)
      pendingOutput = ""
      resizeObserver.disconnect()
      ws?.close()
      term.dispose()
      termRef.current = null
      fitAddonRef.current = null
      wsRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cwd])

  // Refit when this tab becomes active (container was hidden)
  useEffect(() => {
    if (!isActive) return
    const fit = fitAddonRef.current
    const ws = wsRef.current
    if (!fit) return
    requestAnimationFrame(() => {
      fit.fit()
      const dims = fit.proposeDimensions()
      if (dims && ws?.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({ type: "resize", cols: dims.cols, rows: dims.rows })
        )
      }
      termRef.current?.focus()
    })
  }, [isActive])

  // Sync theme
  useEffect(() => {
    const term = termRef.current
    if (!term) return
    term.options.theme = terminalTheme
  }, [terminalTheme])

  return (
    <div
      ref={containerRef}
      className={cn(
        "min-h-0 flex-1 overflow-hidden",
        !isActive && "hidden"
      )}
      style={{ display: isActive ? undefined : "none", height: "100%", overflow: "hidden", padding: "0 8px" }}
    />
  )
})

// ─── Panel with tab bar ───────────────────────────────────────────────────────

interface TerminalPanelProps {
  cwd: string
}

export const TerminalPanel = memo(function TerminalPanel({
  cwd,
}: TerminalPanelProps) {
  const {
    tabs,
    activeTabId,
    addTab,
    closeTab,
    setActiveTab,
    renameTab,
    killAll,
  } = useTerminal()

  return (
    <div className="flex h-full shrink-0 flex-col border-t bg-background">
      {/* Tab bar */}
      <div className="flex h-8 shrink-0 items-stretch border-b">
        {/* Scrollable tab list */}
        <div className="scrollbar-none flex min-w-0 flex-1 items-stretch overflow-x-auto">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "group relative flex shrink-0 items-center gap-1.5 border-r px-3 font-mono text-xs transition-colors",
                  isActive
                    ? "bg-background text-foreground after:absolute after:right-0 after:bottom-0 after:left-0 after:h-px after:bg-primary"
                    : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <TerminalSquare className="h-3 w-3 shrink-0" />
                <span className="max-w-30 truncate">{tab.title}</span>
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label={`Close ${tab.title}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    closeTab(tab.id)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.stopPropagation()
                      closeTab(tab.id)
                    }
                  }}
                  className={cn(
                    "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm transition-colors hover:bg-muted-foreground/20",
                    isActive
                      ? "opacity-60 hover:opacity-100"
                      : "opacity-0 group-hover:opacity-60 group-hover:hover:opacity-100"
                  )}
                >
                  <X className="h-2.5 w-2.5" />
                </span>
              </button>
            )
          })}

          {/* New tab */}
          <button
            type="button"
            onClick={addTab}
            aria-label="New terminal tab"
            className="flex items-center px-2 text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Close panel */}
        <div className="flex items-center border-l px-1.5">
          <Button
            variant="ghost"
            size="icon-sm"
            className="h-5 w-5 text-muted-foreground hover:text-destructive"
            onClick={killAll}
            title="Kill all terminals"
          >
            <Trash2 className="h-3 w-3" />
            <span className="sr-only">Kill all terminals</span>
          </Button>
        </div>
      </div>

      {/* Terminal instances — all mounted, inactive ones are hidden */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {tabs.map((tab) => (
          <TerminalInstance
            key={tab.id}
            id={tab.id}
            cwd={cwd}
            isActive={tab.id === activeTabId}
            onTitleChange={renameTab}
          />
        ))}
      </div>
    </div>
  )
})
