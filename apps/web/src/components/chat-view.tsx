import { useState, useEffect, useCallback, useRef } from "react"

import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"

import { ChatTextbox } from "@/components/chat-textbox"
import { sendPrompt, getBranch, generateTitle } from "@/api/sessions"
import { listMessages, type StoredMessageDto } from "@/api/workspaces"
import { apiUrl } from "@/api/client"
import { useWorkspace } from "@/hooks/workspace-context"
import { ToolCallBlock } from "@/components/tool-call-block"
import { markdownComponents } from "@/components/markdown-components"
import type { Message, TextMessage, ToolMessage } from "@/components/chat-types"

// ── Helpers ───────────────────────────────────────────────────────────────────

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
  const [selectedModelId, setSelectedModelId] = useState<string | null>(
    () => localStorage.getItem(`lambda-code:threadModel:${threadId}`)
  )
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
        } satisfies ToolMessage,
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
    (text: string, modelId: string, provider: string) => {
      if (!hasTitledRef.current) {
        hasTitledRef.current = true
        generateTitle(text)
          .then(({ title }) => setThreadTitle(workspaceId, threadId, title))
          .catch(() => {})
      }
      pinnedRef.current = true
      setMessages((prev) => [...prev, { role: "user", content: text }])
      setIsLoading(true)
      const model = modelId && provider ? { provider, modelId } : undefined
      sendPrompt(sessionId, text, model).catch(() => setIsLoading(false))
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
          selectedModelId={selectedModelId}
          onModelChange={(id) => {
            setSelectedModelId(id)
            localStorage.setItem(`lambda-code:threadModel:${threadId}`, id)
          }}
        />
      </div>
    </div>
  )
}
