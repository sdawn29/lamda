import { useEffect, useMemo, useRef, useState } from "react"
import type { ReactNode, RefObject, UIEvent } from "react"
import {
  FileWarning,
  Loader2,
  MessageSquare,
  MessageSquarePlus,
} from "lucide-react"
import { toast } from "sonner"

import { parseApiError } from "@/features/git"
import { DiffModeToggle } from "@/features/git/components/diff-mode-toggle"
import { DiffStat } from "@/features/git/components/diff-stat"
import { parseDiff } from "@/features/git/components/diff/parser"
import { buildSideBySideRows } from "@/features/git/components/diff/side-by-side"
import type { DiffLine, DiffMode } from "@/features/git/components/diff/types"
import { FileListItem } from "@/features/git/components/file-list-item"
import { SectionCard } from "@/features/git/components/section-card"
import type { ChangedFile } from "@/features/git/components/status-badge"
import { cn } from "@/shared/lib/utils"
import { Alert, AlertDescription } from "@/shared/ui/alert"
import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import { Field, FieldLabel } from "@/shared/ui/field"
import { LoadingSpinner } from "@/shared/ui/loading-spinner"
import { Separator } from "@/shared/ui/separator"
import { Textarea } from "@/shared/ui/textarea"
import { useCreateReviewComment } from "../mutations"
import { usePullRequestReview } from "../queries"
import { PullRequestCommentCard } from "./pull-request-comment-card"
import type { RepoContext } from "../types"

export type ReviewSide = "LEFT" | "RIGHT"

export interface CodeReviewFile {
  path: string
  previousPath: string | null
  status: string
  additions: number
  deletions: number
  patch: string | null
}

export interface CodeReviewComment {
  id: number
  path: string
  body: string
  author: string | null
  createdAt: string
  updatedAt: string
  line: number | null
  originalLine: number | null
  side: ReviewSide | null
  startLine: number | null
  startSide: ReviewSide | null
  inReplyToId: number | null
  commitId: string
  originalCommitId: string
  url: string
}

export interface CodeReviewPayload {
  baseCommitOid?: string
  startCommitOid?: string
  headCommitOid: string
  files: CodeReviewFile[]
  comments: CodeReviewComment[]
}

export interface CodeReviewCommentInput {
  body: string
  path: string
  previousPath?: string
  side: ReviewSide
  line: number
  oldLine?: number
  newLine?: number
  commitId: string
  baseSha?: string
  startSha?: string
  headSha: string
}

interface LineAnchor {
  side: ReviewSide
  line: number
  oldLine?: number
  newLine?: number
}

function anchorKey(side: ReviewSide, line: number): string {
  return `${side}:${line}`
}

function commentAnchor(comment: CodeReviewComment): LineAnchor | null {
  const line = comment.line ?? comment.originalLine
  if (!line) return null
  return {
    side: comment.side ?? "RIGHT",
    line,
    oldLine: comment.originalLine ?? undefined,
    newLine: comment.line ?? undefined,
  }
}

function reviewStatus(file: CodeReviewFile): string {
  if (file.status === "added") return "A"
  if (file.status === "removed") return "D"
  if (file.status === "renamed") return "R"
  return "M"
}

function monospaceColumnWidth(value: string): number {
  let width = 0
  for (const character of value) width += character === "\t" ? 4 : 1
  return width
}

function asChangedFile(file: CodeReviewFile): ChangedFile {
  const status = reviewStatus(file)
  return {
    raw: status.padEnd(2, " "),
    filePath: file.path,
    isStaged: true,
    isUntracked: false,
  }
}

export function PullRequestFiles({
  ctx,
  number,
  enabled,
}: {
  ctx: RepoContext
  number: number
  enabled: boolean
}) {
  const {
    data: review,
    isLoading,
    error,
  } = usePullRequestReview(ctx, number, enabled)
  const createComment = useCreateReviewComment(ctx, number)

  return (
    <CodeReviewFiles
      review={review}
      isLoading={isLoading}
      error={error}
      createCommentPending={createComment.isPending}
      onCreateComment={(input) =>
        createComment.mutateAsync({
          body: input.body,
          commitId: input.commitId,
          path: input.path,
          side: input.side,
          line: input.line,
        })
      }
    />
  )
}

export function CodeReviewFiles({
  review,
  isLoading,
  error,
  createCommentPending,
  onCreateComment,
}: {
  review: CodeReviewPayload | undefined
  isLoading: boolean
  error: unknown
  createCommentPending: boolean
  onCreateComment: (input: CodeReviewCommentInput) => Promise<unknown>
}) {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(
    () => new Set()
  )
  const [mode, setMode] = useState<DiffMode>("inline")
  const commentsByPath = useMemo(() => {
    const grouped = new Map<string, CodeReviewComment[]>()
    for (const comment of review?.comments ?? []) {
      const existing = grouped.get(comment.path)
      if (existing) existing.push(comment)
      else grouped.set(comment.path, [comment])
    }
    return grouped
  }, [review?.comments])

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
        <LoadingSpinner size="sm" />
        Loading changed files
      </div>
    )
  }

  if (error || !review) {
    return (
      <div className="p-2">
        <Alert variant="destructive">
          <FileWarning />
          <AlertDescription>
            {error ? parseApiError(error) : "No changed files found"}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (review.files.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        This review has no changed files.
      </div>
    )
  }

  const additions = review.files.reduce(
    (total, file) => total + file.additions,
    0
  )
  const deletions = review.files.reduce(
    (total, file) => total + file.deletions,
    0
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 px-2.5">
        <span className="text-xs font-medium text-muted-foreground/80">
          Files changed
        </span>
        <DiffStat added={additions} removed={deletions} />
        <div className="flex-1" />
        <DiffModeToggle mode={mode} onModeChange={setMode} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        <SectionCard label="Changes" count={review.files.length}>
          <div className="divide-y divide-border/25">
            {review.files.map((file) => {
              const comments = commentsByPath.get(file.path) ?? []
              return (
                <FileListItem
                  key={file.path}
                  file={asChangedFile(file)}
                  sessionId=""
                  mode={mode}
                  expanded={expandedFiles.has(file.path)}
                  onExpandedChange={(expanded) =>
                    setExpandedFiles((current) => {
                      const next = new Set(current)
                      if (expanded) next.add(file.path)
                      else next.delete(file.path)
                      return next
                    })
                  }
                  counts={{ added: file.additions, removed: file.deletions }}
                  trailing={
                    comments.length > 0 ? (
                      <Badge
                        variant="secondary"
                        className="h-4 gap-0.5 rounded-sm px-1 text-3xs tabular-nums"
                      >
                        <MessageSquare aria-hidden />
                        {comments.length}
                      </Badge>
                    ) : undefined
                  }
                  expandedContent={
                    <ReviewFileDiff
                      file={file}
                      review={review}
                      comments={comments}
                      mode={mode}
                      createCommentPending={createCommentPending}
                      onCreateComment={onCreateComment}
                    />
                  }
                />
              )
            })}
          </div>
        </SectionCard>
      </div>
    </div>
  )
}

function ReviewFileDiff({
  file,
  review,
  comments,
  mode,
  createCommentPending,
  onCreateComment,
}: {
  file: CodeReviewFile
  review: CodeReviewPayload
  comments: CodeReviewComment[]
  mode: DiffMode
  createCommentPending: boolean
  onCreateComment: (input: CodeReviewCommentInput) => Promise<unknown>
}) {
  const [activeAnchor, setActiveAnchor] = useState<LineAnchor | null>(null)
  const [commentBody, setCommentBody] = useState("")
  const lines = useMemo(() => parseDiff(file.patch ?? ""), [file.patch])
  const sideBySideRows = useMemo(() => buildSideBySideRows(lines), [lines])
  const commentsByAnchor = useMemo(() => {
    const grouped = new Map<string, CodeReviewComment[]>()
    for (const comment of comments) {
      const anchor = commentAnchor(comment)
      if (!anchor) continue
      const key = anchorKey(anchor.side, anchor.line)
      const existing = grouped.get(key)
      if (existing) existing.push(comment)
      else grouped.set(key, [comment])
    }
    return grouped
  }, [comments])
  const unplacedComments = useMemo(
    () => comments.filter((comment) => !commentAnchor(comment)),
    [comments]
  )
  async function submitComment() {
    if (!activeAnchor || !commentBody.trim()) return
    try {
      await onCreateComment({
        body: commentBody.trim(),
        commitId: review.headCommitOid,
        baseSha: review.baseCommitOid,
        startSha: review.startCommitOid,
        headSha: review.headCommitOid,
        path: file.path,
        previousPath: file.previousPath ?? undefined,
        side: activeAnchor.side,
        line: activeAnchor.line,
        oldLine: activeAnchor.oldLine,
        newLine: activeAnchor.newLine,
      })
      setCommentBody("")
      setActiveAnchor(null)
      toast.success("Review comment added")
    } catch (commentError) {
      toast.error("Couldn't add review comment", {
        description: parseApiError(commentError),
      })
    }
  }

  return (
    <div className="@container/diff min-h-0 overflow-hidden rounded-md border border-border/40 bg-card/40">
      {!file.patch ? (
        <div className="flex h-full flex-col gap-2 overflow-y-auto">
          <Alert>
            <FileWarning />
            <AlertDescription>
              GitHub did not provide a text patch for this file. It may be
              binary or too large to display.
            </AlertDescription>
          </Alert>
          {comments.length > 0 ? (
            <ReviewComments comments={comments} label="Review comments" />
          ) : null}
        </div>
      ) : (
        <div className="max-h-[min(58vh,32rem)] overflow-auto bg-background/60 font-mono text-xs">
          {mode === "inline" ? (
            <div className="min-w-max">
              {lines.map((line, index) => {
                const anchor: LineAnchor | null =
                  line.kind === "removed" && line.oldLineNum
                    ? {
                        side: "LEFT",
                        line: Number(line.oldLineNum),
                        oldLine: Number(line.oldLineNum),
                      }
                    : line.newLineNum
                      ? {
                          side: "RIGHT",
                          line: Number(line.newLineNum),
                          oldLine: line.oldLineNum
                            ? Number(line.oldLineNum)
                            : undefined,
                          newLine: Number(line.newLineNum),
                        }
                      : null
                const key = anchor ? anchorKey(anchor.side, anchor.line) : null
                const lineComments = key
                  ? (commentsByAnchor.get(key) ?? [])
                  : []
                const composerOpen =
                  anchor &&
                  activeAnchor?.side === anchor.side &&
                  activeAnchor.line === anchor.line

                return (
                  <div key={`${index}-${line.oldLineNum}-${line.newLineNum}`}>
                    <div
                      className={cn(
                        "group/diff-line flex min-h-5 leading-5",
                        line.kind === "added" &&
                          "bg-diff-add/14 hover:bg-diff-add/20",
                        line.kind === "removed" &&
                          "bg-diff-remove/14 hover:bg-diff-remove/20"
                      )}
                    >
                      <div className="sticky left-0 flex shrink-0 bg-background">
                        <span
                          className={cn(
                            "w-0.5 shrink-0",
                            line.kind === "added" && "bg-diff-add/50",
                            line.kind === "removed" && "bg-diff-remove/50"
                          )}
                        />
                        <span className="w-7 shrink-0 pr-1.5 text-right font-mono text-3xs leading-5 text-muted-foreground/30 select-none">
                          {line.oldLineNum}
                        </span>
                        <span className="w-7 shrink-0 border-r border-border/40 pr-1.5 text-right font-mono text-3xs leading-5 text-muted-foreground/30 select-none">
                          {line.newLineNum}
                        </span>
                        <span className="relative w-4 shrink-0 text-center font-mono text-2xs leading-5 select-none">
                          {anchor ? (
                            <button
                              type="button"
                              className="absolute inset-0 hidden items-center justify-center bg-primary text-primary-foreground group-hover/diff-line:flex focus-visible:flex focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                              onClick={() => {
                                setActiveAnchor(anchor)
                                setCommentBody("")
                              }}
                              aria-label={`Comment on ${file.path} line ${anchor.line}`}
                              title="Add review comment"
                            >
                              <MessageSquarePlus
                                className="size-3"
                                aria-hidden
                              />
                            </button>
                          ) : null}
                          {line.kind === "added"
                            ? "+"
                            : line.kind === "removed"
                              ? "−"
                              : ""}
                        </span>
                      </div>
                      <pre className="min-w-0 flex-1 px-3 font-mono whitespace-pre">
                        {line.content || " "}
                      </pre>
                    </div>

                    {lineComments.length > 0 ? (
                      <ReviewComments
                        comments={lineComments}
                        label={`${anchor?.side === "LEFT" ? "Old" : "New"} line ${anchor?.line}`}
                      />
                    ) : null}

                    {composerOpen && anchor ? (
                      <ReviewCommentComposer
                        filePath={file.path}
                        anchor={anchor}
                        body={commentBody}
                        pending={createCommentPending}
                        onBodyChange={setCommentBody}
                        onCancel={() => setActiveAnchor(null)}
                        onSubmit={submitComment}
                      />
                    ) : null}
                  </div>
                )
              })}
            </div>
          ) : (
            <ReviewSideBySideDiff
              rows={sideBySideRows}
              filePath={file.path}
              commentsByAnchor={commentsByAnchor}
              activeAnchor={activeAnchor}
              commentBody={commentBody}
              pending={createCommentPending}
              onOpenComment={(anchor) => {
                setActiveAnchor(anchor)
                setCommentBody("")
              }}
              onBodyChange={setCommentBody}
              onCancel={() => setActiveAnchor(null)}
              onSubmit={submitComment}
            />
          )}

          {unplacedComments.length > 0 ? (
            <ReviewComments
              comments={unplacedComments}
              label="Outdated comments"
            />
          ) : null}
        </div>
      )}
    </div>
  )
}

function ReviewSideBySideDiff({
  rows,
  filePath,
  commentsByAnchor,
  activeAnchor,
  commentBody,
  pending,
  onOpenComment,
  onBodyChange,
  onCancel,
  onSubmit,
}: {
  rows: ReturnType<typeof buildSideBySideRows>
  filePath: string
  commentsByAnchor: Map<string, CodeReviewComment[]>
  activeAnchor: LineAnchor | null
  commentBody: string
  pending: boolean
  onOpenComment: (anchor: LineAnchor) => void
  onBodyChange: (body: string) => void
  onCancel: () => void
  onSubmit: () => void
}) {
  const leftScrollRef = useRef<HTMLDivElement>(null)
  const rightScrollRef = useRef<HTMLDivElement>(null)
  const [composerHeight, setComposerHeight] = useState(0)

  function syncHorizontalScroll(
    event: UIEvent<HTMLDivElement>,
    targetRef: RefObject<HTMLDivElement | null>
  ) {
    const source = event.currentTarget
    const target = targetRef.current
    if (!target) return

    if (target.scrollLeft !== source.scrollLeft) {
      target.scrollLeft = source.scrollLeft
    }
  }

  const threads: Array<{
    key: string
    label: string
    comments: CodeReviewComment[]
  }> = []
  const seenAnchors = new Set<string>()
  let widestLine = 0
  for (const row of rows) {
    widestLine = Math.max(
      widestLine,
      monospaceColumnWidth(row.left?.line.content ?? ""),
      monospaceColumnWidth(row.right?.line.content ?? "")
    )
    for (const [entry, side, label] of [
      [row.left?.line ?? null, "LEFT", "Old"],
      [row.right?.line ?? null, "RIGHT", "New"],
    ] as const) {
      const anchor = sideAnchor(entry, side)
      if (!anchor) continue
      const key = anchorKey(anchor.side, anchor.line)
      if (seenAnchors.has(key)) continue
      seenAnchors.add(key)
      const comments = commentsByAnchor.get(key) ?? []
      if (comments.length > 0) {
        threads.push({ key, label: `${label} line ${anchor.line}`, comments })
      }
    }
  }
  const composerRowIndex = activeAnchor
    ? rows.findIndex((row) => {
        const line =
          activeAnchor.side === "LEFT"
            ? (row.left?.line ?? null)
            : (row.right?.line ?? null)
        const anchor = sideAnchor(line, activeAnchor.side)
        return anchor?.line === activeAnchor.line
      })
    : -1

  const composer = activeAnchor ? (
    <ReviewCommentComposer
      filePath={filePath}
      anchor={activeAnchor}
      body={commentBody}
      pending={pending}
      contained
      onBodyChange={onBodyChange}
      onCancel={onCancel}
      onSubmit={onSubmit}
    />
  ) : null

  return (
    <div className="min-w-0">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] divide-x divide-border/30">
        <ReviewSideColumn
          scrollRef={leftScrollRef}
          lines={rows.map((row) => row.left?.line ?? null)}
          canvasWidthCh={widestLine + 10}
          side="LEFT"
          composerRowIndex={composerRowIndex}
          composer={activeAnchor?.side === "LEFT" ? composer : null}
          composerHeight={composerHeight}
          onComposerHeightChange={setComposerHeight}
          onOpenComment={onOpenComment}
          onScroll={(event) => syncHorizontalScroll(event, rightScrollRef)}
        />
        <ReviewSideColumn
          scrollRef={rightScrollRef}
          lines={rows.map((row) => row.right?.line ?? null)}
          canvasWidthCh={widestLine + 10}
          side="RIGHT"
          composerRowIndex={composerRowIndex}
          composer={activeAnchor?.side === "RIGHT" ? composer : null}
          composerHeight={composerHeight}
          onComposerHeightChange={setComposerHeight}
          onOpenComment={onOpenComment}
          onScroll={(event) => syncHorizontalScroll(event, leftScrollRef)}
        />
      </div>

      {threads.map((thread) => (
        <ReviewComments
          key={thread.key}
          comments={thread.comments}
          label={thread.label}
        />
      ))}
    </div>
  )
}

function ReviewSideColumn({
  scrollRef,
  lines,
  canvasWidthCh,
  side,
  composerRowIndex,
  composer,
  composerHeight,
  onComposerHeightChange,
  onOpenComment,
  onScroll,
}: {
  scrollRef: RefObject<HTMLDivElement | null>
  lines: Array<DiffLine | null>
  canvasWidthCh: number
  side: ReviewSide
  composerRowIndex: number
  composer: ReactNode
  composerHeight: number
  onComposerHeightChange: (height: number) => void
  onOpenComment: (anchor: LineAnchor) => void
  onScroll: (event: UIEvent<HTMLDivElement>) => void
}) {
  return (
    <div
      ref={scrollRef}
      className="min-w-0 overflow-x-auto"
      onScroll={onScroll}
    >
      <div className="min-w-full" style={{ width: `${canvasWidthCh}ch` }}>
        {lines.map((line, index) => (
          <div key={index}>
            <ReviewSideCell
              line={line}
              side={side}
              onOpenComment={onOpenComment}
            />
            {index === composerRowIndex ? (
              <ReviewSideCommentSlot
                active={composer !== null}
                height={composerHeight}
                onHeightChange={onComposerHeightChange}
              >
                {composer}
              </ReviewSideCommentSlot>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}

function ReviewSideCommentSlot({
  active,
  height,
  onHeightChange,
  children,
}: {
  active: boolean
  height: number
  onHeightChange: (height: number) => void
  children: ReactNode
}) {
  const slotRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!active || !slotRef.current) return
    const node = slotRef.current
    const updateHeight = () =>
      onHeightChange(Math.ceil(node.getBoundingClientRect().height))

    updateHeight()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(updateHeight)
    observer.observe(node)
    return () => observer.disconnect()
  }, [active, onHeightChange])

  if (!active) return <div aria-hidden style={{ height }} />

  return (
    <div ref={slotRef} className="sticky left-0 w-[50cqw] p-2">
      {children}
    </div>
  )
}

function sideAnchor(
  line: DiffLine | null,
  side: ReviewSide
): LineAnchor | null {
  if (!line) return null
  const value = side === "LEFT" ? line.oldLineNum : line.newLineNum
  return value
    ? {
        side,
        line: Number(value),
        oldLine: line.oldLineNum ? Number(line.oldLineNum) : undefined,
        newLine: line.newLineNum ? Number(line.newLineNum) : undefined,
      }
    : null
}

function ReviewSideCell({
  line,
  side,
  onOpenComment,
}: {
  line: DiffLine | null
  side: ReviewSide
  onOpenComment: (anchor: LineAnchor) => void
}) {
  if (!line) return <div className="h-5 min-w-full bg-muted/10" />

  const anchor = sideAnchor(line, side)
  const canComment = anchor && (side === "RIGHT" || line.kind === "removed")
  const isAdded = line.kind === "added"
  const isRemoved = line.kind === "removed"
  const lineNumber = side === "LEFT" ? line.oldLineNum : line.newLineNum

  return (
    <div
      className={cn(
        "group/diff-cell flex min-w-full leading-5",
        isAdded && "bg-diff-add/14 hover:bg-diff-add/20",
        isRemoved && "bg-diff-remove/14 hover:bg-diff-remove/20"
      )}
    >
      <div
        className={cn(
          "sticky left-0 z-10 flex shrink-0 select-none",
          isAdded &&
            "bg-[color-mix(in_srgb,var(--diff-add)_18%,var(--background))] group-hover/diff-cell:bg-[color-mix(in_srgb,var(--diff-add)_30%,var(--background))]",
          isRemoved &&
            "bg-[color-mix(in_srgb,var(--diff-remove)_18%,var(--background))] group-hover/diff-cell:bg-[color-mix(in_srgb,var(--diff-remove)_30%,var(--background))]",
          !isAdded && !isRemoved && "bg-background"
        )}
      >
        <span
          className={cn(
            "w-0.5 shrink-0",
            isAdded && "bg-diff-add/50",
            isRemoved && "bg-diff-remove/50"
          )}
        />
        <span
          className={cn(
            "w-7 shrink-0 border-r pr-1.5 text-right font-mono text-3xs leading-5",
            isAdded && "border-diff-add/20 text-diff-add/80",
            isRemoved && "border-diff-remove/20 text-diff-remove/80",
            !isAdded &&
              !isRemoved &&
              "border-border/40 text-muted-foreground/30"
          )}
        >
          {line.kind === "skipped" ? "" : lineNumber}
        </span>
        <span
          className={cn(
            "relative w-4 shrink-0 text-center font-mono text-2xs leading-5",
            isAdded && "text-diff-add",
            isRemoved && "text-diff-remove",
            !isAdded && !isRemoved && "text-muted-foreground/20"
          )}
        >
          {canComment ? (
            <button
              type="button"
              className="absolute inset-0 hidden items-center justify-center bg-primary text-primary-foreground group-hover/diff-cell:flex focus-visible:flex focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
              onClick={() => onOpenComment(anchor)}
              aria-label={`Comment on ${side === "LEFT" ? "old" : "new"} line ${anchor.line}`}
              title="Add review comment"
            >
              <MessageSquarePlus className="size-3" aria-hidden />
            </button>
          ) : null}
          {isAdded ? "+" : isRemoved ? "−" : ""}
        </span>
      </div>
      <pre className="min-w-max flex-1 px-2 font-mono whitespace-pre [tab-size:4]">
        {line.content || " "}
      </pre>
    </div>
  )
}

function ReviewCommentComposer({
  filePath,
  anchor,
  body,
  pending,
  contained = false,
  onBodyChange,
  onCancel,
  onSubmit,
}: {
  filePath: string
  anchor: LineAnchor
  body: string
  pending: boolean
  contained?: boolean
  onBodyChange: (body: string) => void
  onCancel: () => void
  onSubmit: () => void
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border/60 bg-background/95 font-sans shadow-md shadow-black/[0.04]",
        contained ? "w-full" : "sticky left-0 mx-2 my-1 w-[calc(100cqw-1rem)]"
      )}
    >
      <div className="flex h-8 items-center gap-1.5 border-b border-border/50 bg-muted/25 px-2.5">
        <MessageSquarePlus
          className="size-3 text-muted-foreground"
          aria-hidden
        />
        <span className="truncate text-3xs font-medium text-muted-foreground">
          {filePath} · {anchor.side === "LEFT" ? "Old" : "New"} line{" "}
          {anchor.line}
        </span>
      </div>
      <Field className="gap-2 p-2.5">
        <FieldLabel
          className="sr-only"
          htmlFor={`review-comment-${anchor.side}-${anchor.line}`}
        >
          Review comment
        </FieldLabel>
        <Textarea
          id={`review-comment-${anchor.side}-${anchor.line}`}
          value={body}
          onChange={(event) => onBodyChange(event.target.value)}
          placeholder="Leave a review comment…"
          disabled={pending}
          aria-label={`Review comment for line ${anchor.line}`}
          className="min-h-20 resize-y bg-background"
        />
        <div className="flex justify-end gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!body.trim() || pending}
            onClick={onSubmit}
          >
            {pending ? (
              <Loader2 data-icon="inline-start" className="animate-spin" />
            ) : (
              <MessageSquarePlus data-icon="inline-start" />
            )}
            Add comment
          </Button>
        </div>
      </Field>
    </div>
  )
}

function ReviewComments({
  comments,
  label,
}: {
  comments: CodeReviewComment[]
  label: string
}) {
  return (
    <div className="sticky left-0 mx-2 my-1 w-[calc(100cqw-1rem)] max-w-xl overflow-hidden rounded-lg border border-border/60 bg-background/95 font-sans shadow-md shadow-black/[0.04]">
      <div className="flex h-8 items-center gap-1.5 border-b border-border/50 bg-muted/25 px-2.5">
        <MessageSquare className="size-3 text-muted-foreground" aria-hidden />
        <span className="text-3xs font-medium text-muted-foreground">
          {label}
        </span>
        <Badge
          variant="secondary"
          className="h-4 min-w-4 rounded-sm px-1 text-3xs tabular-nums"
        >
          {comments.length}
        </Badge>
      </div>
      {comments.map((comment, index) => (
        <div key={comment.id}>
          {index > 0 ? <Separator /> : null}
          <PullRequestCommentCard
            author={comment.author}
            body={comment.body}
            createdAt={comment.createdAt}
            reviewComment
            embedded
          />
        </div>
      ))}
    </div>
  )
}
