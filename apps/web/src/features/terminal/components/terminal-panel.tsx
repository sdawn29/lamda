import { useEffect, useMemo, useRef, memo } from "react"
import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import { WebLinksAddon } from "@xterm/addon-web-links"
import { Plus, Trash2, X, TerminalSquare } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { useTheme } from "@/shared/components/theme-provider"
import { buildTerminalTheme } from "@/features/themes"
import { useTerminal } from "../store"
import { appendToken, getServerUrl } from "@/shared/lib/client"
import { cn } from "@/shared/lib/utils"
import "@xterm/xterm/css/xterm.css"

const TERMINAL_OUTPUT_FLUSH_MS = 16
const TERMINAL_IMMEDIATE_FLUSH_THRESHOLD = 8_192
// Auto-reconnect backoff for a dropped PTY socket. The server keeps the shell
// alive (orphan grace), so reattaching restores the session transparently.
const TERMINAL_RECONNECT_BASE_MS = 500
const TERMINAL_RECONNECT_MAX_MS = 10_000

// Tracks tab ids whose `initialCommand` has already been dispatched, so that a
// reattach (workspace/tab switch, route change) doesn't re-run it against the
// persistent shell that already executed it. Module-scoped to survive remounts.
const dispatchedInitialCommands = new Set<string>()

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
  const { resolvedTheme, activeColorTheme } = useTheme()
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const terminalTheme = useMemo(
    () => buildTerminalTheme(activeColorTheme[resolvedTheme]),
    [activeColorTheme, resolvedTheme]
  )
  // Latest theme for the mount effect (which must not re-run on theme change,
  // or it would tear down and recreate the live terminal session).
  const terminalThemeRef = useRef(terminalTheme)
  useEffect(() => {
    terminalThemeRef.current = terminalTheme
  }, [terminalTheme])

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
      theme: terminalThemeRef.current,
      linkHandler: {
        activate: (_event, uri) => {
          window.open(uri, "_blank", "noopener,noreferrer")
        },
      },
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    // Detects plain-text URLs in output (e.g. dev server addresses) and makes
    // them clickable; OSC 8 hyperlinks are handled by `linkHandler` above.
    term.loadAddon(
      new WebLinksAddon((_event, uri) => {
        window.open(uri, "_blank", "noopener,noreferrer")
      })
    )
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
    let reconnectTimeout: number | null = null
    let reconnectAttempts = 0
    let hasConnected = false
    let reconnectNoticeShown = false
    let serverUrlCache: string | null = null

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

    const sendResize = () => {
      const dims = fitAddon.proposeDimensions()
      if (dims && ws?.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({ type: "resize", cols: dims.cols, rows: dims.rows })
        )
      }
    }

    const resizeObserver = new ResizeObserver(() => {
      // Skip fit when container is hidden/collapsed to 0 size
      if (!container.offsetWidth || !container.offsetHeight) return
      fitAddon.fit()
      sendResize()
    })
    resizeObserver.observe(container)

    // Input handler is registered once and reads the current `ws` via closure,
    // so it keeps working across reconnects without stacking listeners.
    term.onData((data) => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "input", data }))
      }
    })

    const scheduleReconnect = () => {
      if (cancelled || reconnectTimeout !== null) return
      const delay = Math.min(
        TERMINAL_RECONNECT_BASE_MS * 2 ** reconnectAttempts,
        TERMINAL_RECONNECT_MAX_MS
      )
      reconnectAttempts += 1
      reconnectTimeout = window.setTimeout(() => {
        reconnectTimeout = null
        connect()
      }, delay)
    }

    const connect = () => {
      if (cancelled || !serverUrlCache) return
      const wsBase = serverUrlCache.replace(/^http/, "ws")
      const url = `${wsBase}/terminal?cwd=${encodeURIComponent(cwd)}&workspaceId=${encodeURIComponent(workspaceId)}&terminalId=${encodeURIComponent(id)}`
      ws = new WebSocket(appendToken(url))
      wsRef.current = ws

      ws.onopen = () => {
        if (hasConnected) {
          // Reattaching to a still-alive server PTY: it will replay scrollback,
          // so clear the local view first to avoid duplicating recent output.
          pendingOutput = ""
          term.reset()
        }
        hasConnected = true
        reconnectAttempts = 0
        reconnectNoticeShown = false
        sendResize()
        if (initialCommand && !dispatchedInitialCommands.has(id)) {
          dispatchedInitialCommands.add(id)
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
        // Detach during unmount (workspace/tab switch, route change) is normal —
        // the PTY stays alive server-side for reattach, so don't surface it.
        if (cancelled) return
        if (pendingOutput) flushOutput()
        wsRef.current = null
        // The server keeps the PTY alive through its orphan grace window, so a
        // dropped socket (sleep/wake, server restart, network blip) should be
        // recovered by reattaching rather than abandoned.
        if (!reconnectNoticeShown) {
          term.write("\r\n\x1b[33m[reconnecting…]\x1b[0m\r\n")
          reconnectNoticeShown = true
        }
        scheduleReconnect()
      }
    }

    getServerUrl().then((serverUrl) => {
      if (cancelled) return
      serverUrlCache = serverUrl
      connect()
    })

    return () => {
      cancelled = true
      if (flushTimeout !== null) window.clearTimeout(flushTimeout)
      if (reconnectTimeout !== null) window.clearTimeout(reconnectTimeout)
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
      <div className="flex h-10 shrink-0 items-center gap-1 bg-background px-2 pt-1">
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
