import { useState, useEffect, useCallback, useRef, memo } from "react"
import { StopCircleIcon } from "lucide-react"

import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"

import { ChatTextbox, type ChatTextboxHandle } from "./chat-textbox"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
} from "@/shared/ui/alert-dialog"
import { getServerUrl } from "@/shared/lib/client"
import { useWorkspace } from "@/features/workspace"
import { useMessages } from "../queries"
import { useBranch } from "@/features/git/queries"
import { useBranches } from "@/features/git/queries"
import { useCheckoutBranch } from "@/features/git/mutations"
import { useGenerateTitle } from "../mutations"
import { useSendPrompt } from "../mutations"
import { abortSession } from "../api"
import { ToolCallBlock } from "./tool-call-block"
import { markdownComponents } from "./markdown-components"
import { CopyButton } from "@/shared/components/copy-button"
import { UserMessageContent } from "./user-message"
import { ThinkingIndicator } from "./thinking-indicator"
import type { Message, TextMessage, ToolMessage } from "../types"

interface ChatViewProps {
  sessionId: string
  workspaceName: string
  workspaceId: string
  threadId: string
}

export const ChatView = memo(function ChatView({
  sessionId,
  workspaceId,
  threadId,
}: ChatViewProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const stoppedKey = `lambda-code:stopped:${threadId}`
  const [isStopped, setIsStopped] = useState(
    () => localStorage.getItem(stoppedKey) === "1"
  )
  const [gitError, setGitError] = useState<string | null>(null)
  const [selectedModelId, setSelectedModelId] = useState<string | null>(() =>
    localStorage.getItem(`lambda-code:threadModel:${threadId}`)
  )
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const pinnedRef = useRef(true)
  const hasTitledRef = useRef(false)
  const seededRef = useRef(false)
  const chatTextboxRef = useRef<ChatTextboxHandle>(null)

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
    let es: EventSource | null = null

    getServerUrl().then((base) => {
      if (!active) return
      es = new EventSource(`${base}/session/${sessionId}/events`)

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
    })

    return () => {
      active = false
      es?.close()
    }
  }, [sessionId])

  // ── Auto-scroll ───────────────────────────────────────────────────────────────
  // During streaming, smooth scrolling is called on every delta and the browser
  // interrupts each animation before it finishes, causing the view to lag behind
  // the final content. Rapid smooth-scroll calls also fire onScroll mid-animation,
  // which can flip pinnedRef to false and stop further scrolls entirely.
  // Fix: use instant scrollTop assignment while loading so every update reliably
  // lands at the bottom; only use smooth scroll once the stream is stable.
  useEffect(() => {
    if (!pinnedRef.current) return
    const el = scrollContainerRef.current
    if (!el) return
    if (isLoading) {
      el.scrollTop = el.scrollHeight
    } else {
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

  const handleStop = useCallback(() => {
    abortSession(sessionId).catch((err: unknown) => {
      console.error("[abort]", err)
    })
    setIsLoading(false)
    setIsStopped(true)
    localStorage.setItem(stoppedKey, "1")
  }, [sessionId, stoppedKey])

  const handleSend = useCallback(
    (
      text: string,
      modelId: string,
      provider: string,
      thinkingLevel?: string
    ) => {
      if (!hasTitledRef.current) {
        hasTitledRef.current = true
        generateTitleMutation.mutate(text, {
          onSuccess: ({ title }) =>
            setThreadTitle(workspaceId, threadId, title),
        })
      }
      pinnedRef.current = true
      setIsStopped(false)
      localStorage.removeItem(stoppedKey)
      setMessages((prev) => [...prev, { role: "user", content: text }])
      setIsLoading(true)
      const model = modelId && provider ? { provider, modelId } : undefined
      sendPromptMutation.mutate(
        { text, model, thinkingLevel },
        { onError: () => setIsLoading(false) }
      )
    },
    [
      sendPromptMutation,
      generateTitleMutation,
      workspaceId,
      threadId,
      setThreadTitle,
      stoppedKey,
    ]
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
          {messages.length === 0 && !isLoading && (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center select-none">
              <span className="text-6xl font-light text-muted-foreground/20">
                λ
              </span>
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium text-muted-foreground">
                  Start a conversation
                </p>
                <p className="text-xs text-muted-foreground/60">
                  Ask me to write, fix, or explain code
                </p>
              </div>
              <div className="mt-1 flex flex-wrap justify-center gap-2">
                {[
                  "Explain this codebase to me",
                  "Find and fix bugs in my code",
                  "Write tests for my functions",
                ].map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => chatTextboxRef.current?.setValue(prompt)}
                    className="rounded-lg border border-border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((msg, i) => {
            const key =
              msg.role === "tool" ? msg.toolCallId : `${msg.role}-${i}`
            if (msg.role === "tool") {
              return <ToolCallBlock key={key} msg={msg} />
            }
            if (msg.role === "user") {
              return (
                <div
                  key={key}
                  className="group flex animate-in flex-col items-end gap-1.5 self-end duration-200 fade-in-0 slide-in-from-bottom-2"
                >
                  <div className="rounded-xl bg-muted px-4 py-2 text-sm" data-selectable>
                    <UserMessageContent content={msg.content} />
                  </div>
                  <CopyButton text={msg.content} />
                </div>
              )
            }
            if (!msg.content) return null
            return (
              <div
                key={key}
                className="group flex animate-in flex-col gap-1.5 duration-200 fade-in-0 slide-in-from-bottom-1"
              >
                <div className="prose prose-sm max-w-none dark:prose-invert [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                  <Markdown
                    remarkPlugins={[remarkGfm]}
                    components={markdownComponents}
                  >
                    {msg.content}
                  </Markdown>
                </div>
                <div>
                  <CopyButton text={msg.content} />
                </div>
              </div>
            )
          })}
          {showThinking && <ThinkingIndicator />}
          {isStopped && !isLoading && (
            <div className="flex animate-in items-center gap-1.5 self-start text-muted-foreground/60 duration-200 fade-in-0">
              <StopCircleIcon className="h-3.5 w-3.5 shrink-0 text-destructive" />
              <span className="text-xs">Interrupted</span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="mx-auto w-full max-w-2xl px-6 pb-6">
          <ChatTextbox
            ref={chatTextboxRef}
            onSend={handleSend}
            onStop={handleStop}
            isLoading={isLoading}
            branch={branch}
            branches={branches}
            onBranchSelect={handleBranchSelect}
            sessionId={sessionId}
            selectedModelId={selectedModelId}
            onModelChange={handleModelChange}
          />
        </div>
      </div>
    </>
  )
})
