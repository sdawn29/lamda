import { useState, useEffect, useCallback, useRef } from "react"

import Markdown from "react-markdown"

import { ChatTextbox } from "@/components/chat-textbox"
import { sendPrompt } from "@/api/sessions"
import { apiUrl } from "@/api/client"

interface Message {
  role: "user" | "assistant"
  content: string
}

export function ChatView({ sessionId }: { sessionId: string }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

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

    es.addEventListener("agent_end", () => {
      if (!active) return
      setIsLoading(false)
    })

    return () => {
      active = false
      es.close()
    }
  }, [sessionId])

  // Scroll to bottom whenever messages change or loading indicator appears
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isLoading])

  const handleSend = useCallback(
    (text: string) => {
      setMessages((prev) => [...prev, { role: "user", content: text }])
      setIsLoading(true)
      sendPrompt(sessionId, text).catch(() => setIsLoading(false))
    },
    [sessionId]
  )

  return (
    <div className="flex h-full flex-col p-6">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 overflow-y-auto pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {messages.map((msg, i) => (
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
              <Markdown>{msg.content}</Markdown>
            )}
          </div>
        ))}
        {isLoading && !(messages[messages.length - 1]?.role === "assistant" && messages[messages.length - 1]?.content.length > 0) && (
          <p className="text-muted-foreground self-start text-sm animate-pulse">
            Thinking…
          </p>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="mx-auto w-full max-w-2xl">
        <ChatTextbox onSend={handleSend} isLoading={isLoading} />
      </div>
    </div>
  )
}
