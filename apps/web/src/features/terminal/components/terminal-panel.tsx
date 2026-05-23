import { useEffect, useRef, memo } from "react"
import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import { Plus, Trash2, X, TerminalSquare } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { useTheme } from "@/shared/components/theme-provider"
import { useTerminal } from "../store"
import { getServerUrl } from "@/shared/lib/client"
import { cn } from "@/shared/lib/utils"
import "@xterm/xterm/css/xterm.css"

const TERMINAL_OUTPUT_FLUSH_MS = 16
const TERMINAL_IMMEDIATE_FLUSH_THRESHOLD = 8_192

// Fleet terminal colors — from "terminal.*" entries in the theme JSON
const DARK_TERMINAL_THEME = {
  background: "#0d0d0d",
  foreground: "#d6d6dd",
  cursor: "#d6d6dd",
  cursorAccent: "#5b51ec",
  selectionBackground: "#636262",
  black: "#676767",
  red: "#f14c4c",
  green: "#15ac91",
  yellow: "#e5b95c",
  blue: "#4c9df3",
  magenta: "#e567dc",
  cyan: "#75d3ba",
  white: "#d6d6dd",
  brightBlack: "#676767",
  brightRed: "#f14c4c",
  brightGreen: "#15ac91",
  brightYellow: "#e5b95c",
  brightBlue: "#4c9df3",
  brightMagenta: "#e567dc",
  brightCyan: "#75d3ba",
  brightWhite: "#d6d6dd",
}

// Fleet-derived light terminal — same hues, darkened for white background
const LIGHT_TERMINAL_THEME = {
  background: "#f3efe8",
  foreground: "#1a1a1a",
  cursor: "#228df2",
  cursorAccent: "#ffffff",
  selectionBackground: "#d1e8ff",
  black: "#2a2a2a",
  red: "#c01010",
  green: "#007a60",
  yellow: "#8a5a00",
  blue: "#1565c0",
  magenta: "#9a1a95",
  cyan: "#006b5e",
  white: "#6b6b6b",
  brightBlack: "#6b6b6b",
  brightRed: "#f14c4c",
  brightGreen: "#15ac91",
  brightYellow: "#c48820",
  brightBlue: "#228df2",
  brightMagenta: "#b020b0",
  brightCyan: "#0e7a6e",
  brightWhite: "#2a2a2a",
}

// ─── Single terminal instance (keeps mounted when inactive for session persistence) ───

interface TerminalInstanceProps {
  id: string
  cwd: string
  workspaceId: string
  isActive: boolean
  initialCommand?: string
  onTitleChange: (id: string, title: string) => void
}

const TerminalInstance = memo(function TerminalInstance({
  id,
  cwd,
  workspaceId,
  isActive,
  initialCommand,
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
      linkHandler: {
        activate: (_event, uri) => {
          window.open(uri, "_blank", "noopener,noreferrer")
        },
      },
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
      const url = `${wsBase}/terminal?cwd=${encodeURIComponent(cwd)}&workspaceId=${encodeURIComponent(workspaceId)}`
      ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        const dims = fitAddon.proposeDimensions()
        if (dims) {
          ws!.send(
            JSON.stringify({ type: "resize", cols: dims.cols, rows: dims.rows })
          )
        }
        if (initialCommand) {
          setTimeout(() => {
            if (ws?.readyState === WebSocket.OPEN) {
              ws.send(
                JSON.stringify({ type: "input", data: initialCommand + "\r" })
              )
            }
          }, 150)
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
      className={cn("min-h-0 flex-1 overflow-hidden", !isActive && "hidden")}
      style={{
        display: isActive ? undefined : "none",
        height: "100%",
        overflow: "hidden",
        padding: "0 8px",
      }}
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
  const allStates = ctx.states

  const activeState = allStates[activeWorkspaceId]
  const tabs = activeState?.tabs ?? []
  const activeTabId = activeState?.activeTabId ?? null

  return (
    <div className="flex h-full shrink-0 flex-col bg-background">
      {/* Tab bar — shows only the active workspace's tabs */}
      <div className="flex h-10 shrink-0 items-center gap-1 bg-background px-1">
        {/* Scrollable tab list */}
        <div className="scrollbar-none flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-1">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => ctx.setActiveTab(activeWorkspaceId, tab.id)}
                className={cn(
                  "group relative flex h-7 shrink-0 items-center gap-1.5 rounded-md pr-1.5 pl-3 font-mono text-xs transition-all duration-150 select-none",
                  isActive
                    ? "bg-muted/30 text-foreground shadow-sm ring-1 ring-border/60"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground/70"
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
        </div>

        {/* New tab + Kill all */}
        <div className="flex items-center gap-0.5 px-1">
          <button
            type="button"
            onClick={() => ctx.addTab(activeWorkspaceId, cwd)}
            aria-label="New terminal tab"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
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
        {Object.entries(allStates).flatMap(([wsId, state]) =>
          state.tabs.map((tab) => (
            <TerminalInstance
              key={tab.id}
              id={tab.id}
              cwd={tab.cwd}
              workspaceId={wsId}
              isActive={
                wsId === activeWorkspaceId && tab.id === state.activeTabId
              }
              initialCommand={tab.initialCommand}
              onTitleChange={(id, title) => ctx.renameTab(wsId, id, title)}
            />
          ))
        )}
      </div>
    </div>
  )
})
