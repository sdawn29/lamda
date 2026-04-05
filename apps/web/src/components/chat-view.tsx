import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import {
  CheckIcon,
  ChevronDownIcon,
  Loader2Icon,
  WrenchIcon,
  XIcon,
} from "lucide-react"

import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"

import { ChatTextbox } from "@/components/chat-textbox"
import { sendPrompt, getBranch, generateTitle } from "@/api/sessions"
import { listMessages, type StoredMessageDto } from "@/api/workspaces"
import { apiUrl } from "@/api/client"
import { useWorkspace } from "@/hooks/workspace-context"
import { cn } from "@/lib/utils"

// ── Message types ─────────────────────────────────────────────────────────────

interface TextMessage {
  role: "user" | "assistant"
  content: string
}

interface ToolMessage {
  role: "tool"
  toolCallId: string
  toolName: string
  args: unknown
  status: "running" | "done" | "error"
  result?: unknown
}

type Message = TextMessage | ToolMessage

function storedToMessage(m: StoredMessageDto): Message {
  if (m.role === "tool") {
    const data = JSON.parse(m.content) as {
      toolCallId: string
      toolName: string
      args: unknown
      result: unknown
      status: "running" | "done" | "error"
    }
    return {
      role: "tool",
      toolCallId: data.toolCallId,
      toolName: data.toolName,
      args: data.args,
      result: data.result,
      status: data.status,
    }
  }
  return { role: m.role as "user" | "assistant", content: m.content }
}

// ── ToolCallBlock ─────────────────────────────────────────────────────────────

function LivePre({ text, live }: { text: string; live: boolean }) {
  const ref = useRef<HTMLPreElement>(null)
  useEffect(() => {
    if (live && ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight
    }
  }, [text, live])
  return (
    <pre
      ref={ref}
      className="max-h-64 overflow-auto break-all whitespace-pre-wrap text-muted-foreground"
    >
      {text}
    </pre>
  )
}

function argsSummary(args: unknown): string {
  if (typeof args !== "object" || args === null) return ""
  const a = args as Record<string, unknown>
  if (typeof a.command === "string") return a.command
  if (typeof a.file_path === "string") return a.file_path
  if (typeof a.path === "string") return a.path
  if (typeof a.pattern === "string") return a.pattern
  const first = Object.values(a)[0]
  return typeof first === "string" ? first : ""
}

function ToolCallBlock({ msg }: { msg: ToolMessage }) {
  // Auto-expand while running, collapse when done unless user has toggled it
  const [userToggled, setUserToggled] = useState(false)
  const [manualExpanded, setManualExpanded] = useState(false)
  const expanded = userToggled ? manualExpanded : msg.status === "running"

  function toggle() {
    setUserToggled(true)
    setManualExpanded((e) => !e)
  }

  const argsText = useMemo(
    () =>
      typeof msg.args === "object"
        ? JSON.stringify(msg.args, null, 2)
        : String(msg.args),
    [msg.args]
  )

  const resultText = useMemo(() => {
    if (msg.result === undefined) return null
    if (typeof msg.result === "string") return msg.result
    // MCP-style tool output: { content: [{ type: "text", text: "..." }] }
    if (
      typeof msg.result === "object" &&
      msg.result !== null &&
      Array.isArray((msg.result as Record<string, unknown>).content)
    ) {
      const parts = (msg.result as { content: { type: string; text?: string }[] }).content
      const text = parts
        .filter((p) => p.type === "text" && typeof p.text === "string")
        .map((p) => p.text)
        .join("")
      if (text) return text
    }
    return JSON.stringify(msg.result, null, 2)
  }, [msg.result])

  const summary = argsSummary(msg.args)

  return (
    <div className="w-full max-w-2xl self-start rounded-lg border border-border bg-muted/20 text-xs">
      <button
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
        onClick={toggle}
      >
        {msg.status === "running" ? (
          <Loader2Icon className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
        ) : msg.status === "error" ? (
          <XIcon className="h-3.5 w-3.5 shrink-0 text-destructive" />
        ) : (
          <CheckIcon className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
        )}
        <WrenchIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="font-medium text-foreground">{msg.toolName}</span>
        {summary && (
          <span className="truncate text-muted-foreground">{summary}</span>
        )}
        <ChevronDownIcon
          className={cn(
            "ml-auto h-3 w-3 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-180"
          )}
        />
      </button>

      {expanded && (
        <div className="space-y-2 border-t border-border px-3 py-2">
          <pre className="max-h-32 overflow-auto break-all whitespace-pre-wrap text-muted-foreground">
            {argsText}
          </pre>
          {resultText && (
            <>
              <div className="border-t border-border" />
              <LivePre text={resultText} live={msg.status === "running"} />
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Markdown components (stable reference) ────────────────────────────────────

const markdownComponents = {
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="my-2 overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }: { children?: React.ReactNode }) => (
    <thead className="bg-muted/50">{children}</thead>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="border-b border-border px-4 py-2 text-left font-medium">
      {children}
    </th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="border-b border-border/50 px-4 py-2 last:border-0">
      {children}
    </td>
  ),
  tr: ({ children }: { children?: React.ReactNode }) => (
    <tr className="transition-colors hover:bg-muted/30">{children}</tr>
  ),
}

// ── ChatView ──────────────────────────────────────────────────────────────────

interface ChatViewProps {
  sessionId: string
  workspaceName: string
  workspaceId: string
  threadId: string
}

export function ChatView({
  sessionId,
  workspaceName,
  workspaceId,
  threadId,
}: ChatViewProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [branch, setBranch] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const pinnedRef = useRef(true)
  const hasTitledRef = useRef(false)

  const { setThreadTitle } = useWorkspace()

  // ── Load message history on mount (component is keyed by threadId) ──────────
  useEffect(() => {
    let cancelled = false
    listMessages(sessionId)
      .then(({ messages: stored }) => {
        if (cancelled) return
        const loaded = stored.map(storedToMessage)
        setMessages(loaded)
        hasTitledRef.current = loaded.length > 0
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    getBranch(sessionId)
      .then((r) => setBranch(r.branch))
      .catch(() => {})
  }, [sessionId])

  useEffect(() => {
    let active = true
    const es = new EventSource(apiUrl(`/session/${sessionId}/events`))

    es.addEventListener("message_start", () => {
      if (!active) return
      setMessages((prev) => [...prev, { role: "assistant", content: "" }])
    })

    es.addEventListener("message_update", (e: MessageEvent) => {
      if (!active) return
      const data = JSON.parse(e.data) as {
        assistantMessageEvent?: { type: string; delta: string }
      }
      if (data.assistantMessageEvent?.type === "text_delta") {
        const delta = data.assistantMessageEvent.delta
        setMessages((prev) => {
          const next = [...prev]
          const last = next[next.length - 1]
          if (last?.role === "assistant") {
            next[next.length - 1] = { ...last, content: last.content + delta }
          }
          return next
        })
      }
    })

    es.addEventListener("tool_execution_start", (e: MessageEvent) => {
      if (!active) return
      const data = JSON.parse(e.data) as {
        toolCallId: string
        toolName: string
        args: unknown
      }
      setMessages((prev) => [
        ...prev,
        {
          role: "tool",
          toolCallId: data.toolCallId,
          toolName: data.toolName,
          args: data.args,
          status: "running",
        },
      ])
    })

    es.addEventListener("tool_execution_update", (e: MessageEvent) => {
      if (!active) return
      const data = JSON.parse(e.data) as {
        toolCallId: string
        partialResult: unknown
      }
      setMessages((prev) =>
        prev.map((msg) =>
          msg.role === "tool" && msg.toolCallId === data.toolCallId
            ? { ...msg, result: data.partialResult }
            : msg
        )
      )
    })

    es.addEventListener("tool_execution_end", (e: MessageEvent) => {
      if (!active) return
      const data = JSON.parse(e.data) as {
        toolCallId: string
        result: unknown
        isError: boolean
      }
      setMessages((prev) =>
        prev.map((msg) =>
          msg.role === "tool" && msg.toolCallId === data.toolCallId
            ? {
                ...msg,
                status: data.isError ? "error" : "done",
                result: data.result,
              }
            : msg
        )
      )
    })

    es.addEventListener("agent_end", () => {
      if (!active) return
      setIsLoading(false)
    })

    return () => {
      active = false
      es.close()
    }
  }, [sessionId])

  useEffect(() => {
    if (pinnedRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    }
  }, [messages, isLoading])

  function handleScroll() {
    const el = scrollContainerRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    pinnedRef.current = distanceFromBottom < 80
  }

  const handleSend = useCallback(
    (text: string) => {
      if (!hasTitledRef.current) {
        hasTitledRef.current = true
        generateTitle(text)
          .then(({ title }) => setThreadTitle(workspaceId, threadId, title))
          .catch(() => {})
      }
      pinnedRef.current = true
      setMessages((prev) => [...prev, { role: "user", content: text }])
      setIsLoading(true)
      sendPrompt(sessionId, text).catch(() => setIsLoading(false))
    },
    [sessionId, workspaceId, threadId, setThreadTitle]
  )

  const footerLabel = `${workspaceName}${branch ? ` / ${branch}` : ""}`

  return (
    <div className="flex h-full flex-col">
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-3 overflow-y-auto px-6 pt-6 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {messages.map((msg, i) => {
          if (msg.role === "tool") {
            return <ToolCallBlock key={i} msg={msg} />
          }
          return (
            <div
              key={i}
              className={
                msg.role === "user"
                  ? "self-end rounded-xl bg-muted px-4 py-2 text-sm"
                  : "prose prose-sm self-start dark:prose-invert"
              }
            >
              {msg.role === "user" ? (
                msg.content
              ) : (
                <Markdown
                  remarkPlugins={[remarkGfm]}
                  components={markdownComponents}
                >
                  {msg.content}
                </Markdown>
              )}
            </div>
          )
        })}
        {isLoading &&
          !(
            messages[messages.length - 1]?.role === "assistant" &&
            (messages[messages.length - 1] as TextMessage).content.length > 0
          ) && (
            <p className="animate-pulse self-start text-sm text-muted-foreground">
              Thinking…
            </p>
          )}
        <div ref={bottomRef} />
      </div>

      <div className="mx-auto w-full max-w-2xl px-6 pb-6">
        <ChatTextbox
          onSend={handleSend}
          isLoading={isLoading}
          footerLabel={footerLabel}
        />
      </div>
    </div>
  )
}
