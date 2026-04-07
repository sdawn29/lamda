import { useState, useEffect, useCallback, useRef } from "react"

import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"

import { ChatTextbox } from "@/components/chat-textbox"
import { TerminalPanel } from "@/components/terminal-panel"
import { DiffPanel } from "@/components/diff-panel"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
} from "@/components/ui/alert-dialog"
import {
  sendPrompt,
  getBranch,
  listBranches,
  checkoutBranch,
  generateTitle,
} from "@/api/sessions"
import { listMessages, type StoredMessageDto } from "@/api/workspaces"
import { apiUrl } from "@/api/client"
import { useWorkspace } from "@/hooks/workspace-context"
import { useTerminal } from "@/hooks/terminal-context"
import { useDiffPanel } from "@/hooks/diff-panel-context"
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
  workspacePath: string
  threadId: string
}

export function ChatView({
  sessionId,
  workspaceName,
  workspaceId,
  workspacePath,
  threadId,
}: ChatViewProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [gitError, setGitError] = useState<string | null>(null)
  const [branch, setBranch] = useState<string | null>(null)
  const [branches, setBranches] = useState<string[]>([])
  const [selectedModelId, setSelectedModelId] = useState<string | null>(() =>
    localStorage.getItem(`lambda-code:threadModel:${threadId}`)
  )
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const pinnedRef = useRef(true)
  const hasTitledRef = useRef(false)

  const { setThreadTitle } = useWorkspace()
  const { isOpen: terminalOpen } = useTerminal()
  const { isOpen: diffOpen } = useDiffPanel()

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
    listBranches(sessionId)
      .then((r) => setBranches(r.branches))
      .catch(() => {})
  }, [sessionId])

  const handleBranchSelect = useCallback(
    (selectedBranch: string) => {
      checkoutBranch(sessionId, selectedBranch)
        .then((r) => {
          if (r.branch) setBranch(r.branch)
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err)
          // Strip the "API 500: " prefix and parse JSON error if present
          const stripped = msg.replace(/^API \d+:\s*/, "")
          try {
            const parsed = JSON.parse(stripped) as { error?: string }
            setGitError(parsed.error ?? stripped)
          } catch {
            setGitError(stripped)
          }
        })
    },
    [sessionId]
  )

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

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    pinnedRef.current = distanceFromBottom < 80
  }, [])

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

  const lastMsg = messages[messages.length - 1]
  const showThinking =
    isLoading &&
    !(
      lastMsg?.role === "assistant" &&
      (lastMsg as TextMessage).content.length > 0
    )

  return (
    <>
    <AlertDialog open={gitError !== null} onOpenChange={(open) => { if (!open) setGitError(null) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Git Error</AlertDialogTitle>
          <AlertDialogDescription>{gitError}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={() => setGitError(null)}>OK</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <div className="flex h-full min-w-0">
      {/* Main chat column */}
      <div className="flex min-w-0 flex-1 flex-col">
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
                    : "prose prose-sm w-full max-w-none dark:prose-invert [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
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
          {showThinking && (
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
            workspaceName={workspaceName}
            branch={branch}
            branches={branches}
            onBranchSelect={handleBranchSelect}
            selectedModelId={selectedModelId}
            onModelChange={(id) => {
              setSelectedModelId(id)
              localStorage.setItem(`lambda-code:threadModel:${threadId}`, id)
            }}
          />
        </div>
        {terminalOpen && <TerminalPanel cwd={workspacePath} />}
      </div>

      {/* Right-side diff panel */}
      {diffOpen && <DiffPanel cwd={workspacePath} />}
    </div>
    </>
  )
}
