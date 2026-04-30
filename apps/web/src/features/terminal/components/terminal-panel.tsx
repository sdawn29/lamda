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
  background: "#121212",
  foreground: "#e8e8d3",
  cursor: "#8197bf",
  cursorAccent: "#0c0c0c",
  selectionBackground: "#8197bf40",
  black: "#1e1e1e",
  red: "#cc3333",
  green: "#99ad6a",
  yellow: "#fad07a",
  blue: "#8197bf",
  magenta: "#c6b6ee",
  cyan: "#8fbfdc",
  white: "#e8e8d3",
  brightBlack: "#888888",
  brightRed: "#d05050",
  brightGreen: "#a8bc78",
  brightYellow: "#ffdf8e",
  brightBlue: "#98a8cc",
  brightMagenta: "#d4c4f0",
  brightCyan: "#9fcee8",
  brightWhite: "#f0f0e0",
}

const LIGHT_TERMINAL_THEME = {
  background: "#f3efe8",
  foreground: "#1a1815",
  cursor: "#4a6a9f",
  cursorAccent: "#f3efe8",
  selectionBackground: "#4a6a9f33",
  black: "#1c1c1c",
  red: "#902020",
  green: "#5a7842",
  yellow: "#c4870a",
  blue: "#4a6a9f",
  magenta: "#7c5aaf",
  cyan: "#3a8fa8",
  white: "#605958",
  brightBlack: "#514948",
  brightRed: "#a02525",
  brightGreen: "#6a8850",
  brightYellow: "#d4970c",
  brightBlue: "#5a7abf",
  brightMagenta: "#8c6abf",
  brightCyan: "#4a9fb8",
  brightWhite: "#2c2c2c",
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

  // Mount xterm + WebSocket once — cwd is fixed at tab creation time and never changes
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 12,
      fontFamily:
        '"JetBrains Mono", "Menlo", "Monaco", "Courier New", monospace',
      scrollback: 5000,
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
      // Skip fit when container is hidden/collapsed to 0 size
      if (!container.offsetWidth || !container.offsetHeight) return
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
  // cwd is intentionally excluded — it's fixed at tab creation time and must not trigger re-mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Refit when this instance becomes active (was hidden)
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
  activeWorkspaceId: string
  cwd: string
}

export const TerminalPanel = memo(function TerminalPanel({
  activeWorkspaceId,
  cwd,
}: TerminalPanelProps) {
  const ctx = useTerminal()
  const allStates = ctx.getAllStates()

  const activeState = allStates.get(activeWorkspaceId)
  const tabs = activeState?.tabs ?? []
  const activeTabId = activeState?.activeTabId ?? null

  return (
    <div className="flex h-full shrink-0 flex-col border-t bg-background">
      {/* Tab bar — shows only the active workspace's tabs */}
      <div className="flex h-8 shrink-0 items-stretch border-b">
        {/* Scrollable tab list */}
        <div className="scrollbar-none flex min-w-0 flex-1 items-stretch overflow-x-auto">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => ctx.setActiveTab(activeWorkspaceId, tab.id)}
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
                    ctx.closeTab(activeWorkspaceId, tab.id)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.stopPropagation()
                      ctx.closeTab(activeWorkspaceId, tab.id)
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
            onClick={() => ctx.addTab(activeWorkspaceId, cwd)}
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
            onClick={() => ctx.killAll(activeWorkspaceId)}
            title="Kill all terminals"
          >
            <Trash2 className="h-3 w-3" />
            <span className="sr-only">Kill all terminals</span>
          </Button>
        </div>
      </div>

      {/* Terminal instances — ALL workspace instances are mounted here.
          Inactive workspace/tab instances are CSS-hidden so their PTY connections stay alive. */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {Array.from(allStates.entries()).flatMap(([wsId, state]) =>
          state.tabs.map((tab) => (
            <TerminalInstance
              key={tab.id}
              id={tab.id}
              cwd={tab.cwd}
              isActive={wsId === activeWorkspaceId && tab.id === state.activeTabId}
              onTitleChange={(id, title) => ctx.renameTab(wsId, id, title)}
            />
          ))
        )}
      </div>
    </div>
  )
})
