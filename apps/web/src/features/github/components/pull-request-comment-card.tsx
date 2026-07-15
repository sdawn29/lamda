import { useId, useMemo, useState } from "react"
import { Code2, Loader2, MessageSquare, Reply, Send } from "lucide-react"
import { toast } from "sonner"

import { parseApiError } from "@/features/git"
import { parseDiff } from "@/features/git/components/diff/parser"
import type { DiffLine } from "@/features/git/components/diff/types"
import { RemoteMarkdown } from "@/shared/components/remote-markdown"
import { formatRelativeDate } from "@/shared/lib/formatters"
import { cn } from "@/shared/lib/utils"
import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import { Field, FieldLabel } from "@/shared/ui/field"
import { Textarea } from "@/shared/ui/textarea"

export interface PullRequestCommentCardProps {
  author: string | null
  body: string
  createdAt: string
  context?: string
  reviewComment?: boolean
  embedded?: boolean
  diff?: {
    patch: string
    line: number | null
    side: "LEFT" | "RIGHT" | null
  }
  onReply?: (body: string) => Promise<unknown>
}

function matchesAnchor(
  line: DiffLine,
  anchor: PullRequestCommentCardProps["diff"]
): boolean {
  if (!anchor?.line) return false
  const lineNumber = String(anchor.line)
  if (anchor.side === "LEFT") return line.oldLineNum === lineNumber
  if (anchor.side === "RIGHT") return line.newLineNum === lineNumber
  return line.oldLineNum === lineNumber || line.newLineNum === lineNumber
}

function CommentDiffPreview({
  patch,
  line,
  side,
}: NonNullable<PullRequestCommentCardProps["diff"]>) {
  const snippet = useMemo(() => {
    const lines = parseDiff(patch)
    if (lines.length === 0) return []
    const target = lines.findIndex((item) =>
      matchesAnchor(item, { patch, line, side })
    )
    const center = target >= 0 ? target : 0
    return lines.slice(
      Math.max(0, center - 3),
      Math.min(lines.length, center + 4)
    )
  }, [line, patch, side])

  if (snippet.length === 0) return null

  return (
    <div className="border-b border-border/40 bg-background/60 font-mono text-xs">
      <div className="max-h-36 overflow-auto py-1">
        <div className="min-w-max">
          {snippet.map((item, index) => {
            const isAdded = item.kind === "added"
            const isRemoved = item.kind === "removed"
            const isTarget = matchesAnchor(item, { patch, line, side })
            return (
              <div
                key={`${index}-${item.oldLineNum}-${item.newLineNum}`}
                className={cn(
                  "flex min-h-5 leading-5",
                  isAdded && "bg-diff-add/14",
                  isRemoved && "bg-diff-remove/14",
                  isTarget && "ring-1 ring-primary/45 ring-inset"
                )}
              >
                <span
                  className={cn(
                    "w-0.5 shrink-0",
                    isAdded && "bg-diff-add/60",
                    isRemoved && "bg-diff-remove/60",
                    isTarget && !isAdded && !isRemoved && "bg-primary/60"
                  )}
                />
                <span className="w-7 shrink-0 pr-1.5 text-right text-3xs text-muted-foreground/35 select-none">
                  {item.oldLineNum}
                </span>
                <span className="w-7 shrink-0 border-r border-border/40 pr-1.5 text-right text-3xs text-muted-foreground/35 select-none">
                  {item.newLineNum}
                </span>
                <span
                  className={cn(
                    "w-4 shrink-0 text-center text-2xs select-none",
                    isAdded && "text-diff-add",
                    isRemoved && "text-diff-remove"
                  )}
                >
                  {isAdded ? "+" : isRemoved ? "−" : ""}
                </span>
                <pre className="min-w-0 flex-1 px-2 whitespace-pre">
                  {item.kind === "skipped" ? "…" : item.content || " "}
                </pre>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** Shared presentation for PR conversation and inline file-review comments. */
export function PullRequestCommentCard({
  author,
  body,
  createdAt,
  context,
  reviewComment = false,
  embedded = false,
  diff,
  onReply,
}: PullRequestCommentCardProps) {
  const displayAuthor = author ?? "Unknown"
  const replyId = useId()
  const [replyOpen, setReplyOpen] = useState(false)
  const [replyBody, setReplyBody] = useState("")
  const [replyPending, setReplyPending] = useState(false)

  async function submitReply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const reply = replyBody.trim()
    if (!reply || !onReply) return

    setReplyPending(true)
    try {
      await onReply(reply)
      setReplyBody("")
      setReplyOpen(false)
      toast.success("Reply added")
    } catch (error) {
      toast.error("Couldn't add reply", {
        description: parseApiError(error),
      })
    } finally {
      setReplyPending(false)
    }
  }

  return (
    <article
      className={cn(
        "overflow-hidden",
        !embedded &&
          "rounded-xl border border-border/60 bg-card/70 shadow-sm shadow-black/[0.025]"
      )}
    >
      <div className="flex items-center gap-2 border-b border-border/40 bg-muted/20 px-3 py-2">
        <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-3xs font-semibold text-primary">
          {displayAuthor.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-2xs font-medium">{displayAuthor}</p>
          <p
            className="text-3xs text-muted-foreground/60"
            title={new Date(createdAt).toLocaleString()}
          >
            {formatRelativeDate(createdAt)}
          </p>
        </div>
        <Badge variant="secondary" className="max-w-[55%] gap-1">
          {reviewComment ? (
            <Code2 aria-hidden />
          ) : (
            <MessageSquare aria-hidden />
          )}
          <span className="truncate">
            {context ?? (reviewComment ? "File review" : "Conversation")}
          </span>
        </Badge>
      </div>
      {diff ? <CommentDiffPreview {...diff} /> : null}
      <div className="p-3">
        <RemoteMarkdown content={body} />
      </div>
      {onReply ? (
        <div className="border-t border-border/40 bg-muted/10 px-3 py-2">
          {replyOpen ? (
            <form className="flex flex-col gap-2" onSubmit={submitReply}>
              <Field data-disabled={replyPending || undefined}>
                <FieldLabel htmlFor={replyId} className="sr-only">
                  Reply to {displayAuthor}
                </FieldLabel>
                <Textarea
                  id={replyId}
                  value={replyBody}
                  onChange={(event) => setReplyBody(event.target.value)}
                  placeholder={`Reply to ${displayAuthor}…`}
                  disabled={replyPending}
                  autoFocus
                  className="min-h-20 resize-y bg-background/75"
                />
              </Field>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-3xs text-muted-foreground">
                  Replying to {author ? `@${author}` : displayAuthor}
                </span>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    disabled={replyPending}
                    onClick={() => {
                      setReplyBody("")
                      setReplyOpen(false)
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="xs"
                    disabled={!replyBody.trim() || replyPending}
                  >
                    {replyPending ? (
                      <Loader2
                        data-icon="inline-start"
                        className="animate-spin"
                      />
                    ) : (
                      <Send data-icon="inline-start" />
                    )}
                    Reply
                  </Button>
                </div>
              </div>
            </form>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => setReplyOpen(true)}
            >
              <Reply data-icon="inline-start" />
              Reply
            </Button>
          )}
        </div>
      ) : null}
    </article>
  )
}
