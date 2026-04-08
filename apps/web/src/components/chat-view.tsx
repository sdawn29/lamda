import { useState, useEffect, useCallback, useRef, memo } from "react"

import { CheckIcon, CopyIcon } from "lucide-react"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"

import { ChatTextbox } from "@/components/chat-textbox"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
} from "@/components/ui/alert-dialog"
import { apiUrl } from "@/api/client"
import { useWorkspace } from "@/hooks/workspace-context"
import { useMessages } from "@/queries/use-messages"
import { useBranch } from "@/queries/use-branch"
import { useBranches } from "@/queries/use-branches"
import { useCheckoutBranch } from "@/mutations/use-checkout-branch"
import { useGenerateTitle } from "@/mutations/use-generate-title"
import { useSendPrompt } from "@/mutations/use-send-prompt"
import { ToolCallBlock } from "@/components/tool-call-block"
import { markdownComponents } from "@/components/markdown-components"
import type { Message, TextMessage, ToolMessage } from "@/components/chat-types"

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      aria-label="Copy message"
      onClick={() => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-foreground/8 hover:text-foreground group-hover:opacity-100"
    >
      {copied ? (
        <CheckIcon className="size-3.5 text-green-500" />
      ) : (
        <CopyIcon className="size-3.5" />
      )}
    </button>
  )
}

interface ChatViewProps {
  sessionId: string
  workspaceName: string
  workspaceId: string
  threadId: string
}

export const ChatView = memo(function ChatView({
  sessionId,
  workspaceName,
  workspaceId,
  threadId,
}: ChatViewProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [gitError, setGitError] = useState<string | null>(null)
  const [selectedModelId, setSelectedModelId] = useState<string | null>(() =>
    localStorage.getItem(`lambda-code:threadModel:${threadId}`)
  )
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const pinnedRef = useRef(true)
  const hasTitledRef = useRef(false)
  const seededRef = useRef(false)

  const { setThreadTitle } = useWorkspace()

  // ── Queries ───────────────────────────────────────────────────────────────────
  const { data: messagesData } = useMessages(sessionId)
  const { data: branchData } = useBranch(sessionId)
  const { data: branchesData } = useBranches(sessionId)

  const branch = branchData?.branch ?? null
  const branches = branchesData?.branches ?? []

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const checkoutBranchMutation = useCheckoutBranch(sessionId)
  const generateTitleMutation = useGenerateTitle()
  const sendPromptMutation = useSendPrompt(sessionId)

  // ── Seed messages from query (once, on first load) ────────────────────────────
  useEffect(() => {
    if (messagesData && !seededRef.current) {
      seededRef.current = true
      setMessages(messagesData)
      hasTitledRef.current = messagesData.length > 0
    }
  }, [messagesData])

  // ── SSE event stream ──────────────────────────────────────────────────────────
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

  // ── Auto-scroll ───────────────────────────────────────────────────────────────
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

  const handleModelChange = useCallback(
    (id: string) => {
      setSelectedModelId(id)
      localStorage.setItem(`lambda-code:threadModel:${threadId}`, id)
    },
    [threadId]
  )

  const handleBranchSelect = useCallback(
    (selectedBranch: string) => {
      checkoutBranchMutation.mutate(selectedBranch, {
        onError: (err) => {
          const msg = err instanceof Error ? err.message : String(err)
          const stripped = msg.replace(/^API \d+:\s*/, "")
          try {
            const parsed = JSON.parse(stripped) as { error?: string }
            setGitError(parsed.error ?? stripped)
          } catch {
            setGitError(stripped)
          }
        },
      })
    },
    [checkoutBranchMutation]
  )

  const handleSend = useCallback(
    (text: string, modelId: string, provider: string) => {
      if (!hasTitledRef.current) {
        hasTitledRef.current = true
        generateTitleMutation.mutate(text, {
          onSuccess: ({ title }) => setThreadTitle(workspaceId, threadId, title),
        })
      }
      pinnedRef.current = true
      setMessages((prev) => [...prev, { role: "user", content: text }])
      setIsLoading(true)
      const model = modelId && provider ? { provider, modelId } : undefined
      sendPromptMutation.mutate(
        { text, model },
        { onError: () => setIsLoading(false) }
      )
    },
    [sendPromptMutation, generateTitleMutation, workspaceId, threadId, setThreadTitle]
  )

  const lastMsg = messages[messages.length - 1]
  const showThinking =
    isLoading &&
    !(lastMsg?.role === "assistant" && (lastMsg as TextMessage).content.length > 0)

  return (
    <>
      <AlertDialog
        open={gitError !== null}
        onOpenChange={(open) => {
          if (!open) setGitError(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Git Error</AlertDialogTitle>
            <AlertDialogDescription>{gitError}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setGitError(null)}>
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex min-w-0 flex-1 flex-col">
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-3 overflow-y-auto px-6 pt-6 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {messages.map((msg, i) => {
            const key = msg.role === "tool" ? msg.toolCallId : `${msg.role}-${i}`
            if (msg.role === "tool") {
              return <ToolCallBlock key={key} msg={msg} />
            }
            if (msg.role === "user") {
              return (
                <div key={key} className="group animate-in fade-in-0 slide-in-from-bottom-2 duration-200 flex flex-col items-end gap-1.5 self-end">
                  <div className="rounded-xl bg-muted px-4 py-2 text-sm">
                    {msg.content}
                  </div>
                  <CopyButton text={msg.content} />
                </div>
              )
            }
            return (
              <div key={key} className="group animate-in fade-in-0 slide-in-from-bottom-1 duration-200 flex flex-col gap-1.5">
                <div className="prose prose-sm max-w-none dark:prose-invert [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                  <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                    {msg.content}
                  </Markdown>
                </div>
                <div>
                  <CopyButton text={msg.content} />
                </div>
              </div>
            )
          })}
          {showThinking && (
            <div className="animate-in fade-in-0 duration-200 flex self-start items-center gap-1 py-1">
              <span className="size-1.5 rounded-full bg-muted-foreground/60 animate-thinking-dot" style={{ animationDelay: "0ms" }} />
              <span className="size-1.5 rounded-full bg-muted-foreground/60 animate-thinking-dot" style={{ animationDelay: "200ms" }} />
              <span className="size-1.5 rounded-full bg-muted-foreground/60 animate-thinking-dot" style={{ animationDelay: "400ms" }} />
            </div>
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
            onModelChange={handleModelChange}
          />
        </div>
      </div>
    </>
  )
})
