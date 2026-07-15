import { useState } from "react"
import {
  ArrowLeft,
  CircleDot,
  ExternalLink,
  GitBranch,
  GitCommitHorizontal,
  GitMerge,
  Loader2,
  MessageSquare,
} from "lucide-react"
import { toast } from "sonner"

import { openExternal } from "@/features/electron/api"
import { parseApiError } from "@/features/git"
import {
  CodeReviewFiles,
  type CodeReviewCommentInput,
} from "@/features/github/components/pull-request-files"
import { PullRequestCommentCard } from "@/features/github/components/pull-request-comment-card"
import { PullRequestCommits } from "@/features/github/components/github-review-view"
import { RemoteMarkdown } from "@/shared/components/remote-markdown"
import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import { SectionLabel } from "@/shared/ui/section-label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs"
import { Textarea } from "@/shared/ui/textarea"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog"
import {
  useCheckoutMergeRequest,
  useCommentMergeRequest,
  useCreateMergeRequestReviewComment,
  useMergeMergeRequest,
  useReplyToMergeRequestReviewComment,
} from "../mutations"
import { useMergeRequest, useMergeRequestReview } from "../queries"
import type { RepoContext } from "../types"

interface ActivityItem {
  key: string
  author: string | null
  body: string
  createdAt: string
  context: string
  reviewComment: boolean
  discussionId?: string
  diff?: {
    patch: string
    line: number | null
    side: "LEFT" | "RIGHT" | null
  }
}

function DetailMessage({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted-foreground">
      {message}
    </div>
  )
}

function ActivityList({
  items,
  loading,
  error,
  onReply,
}: {
  items: ActivityItem[]
  loading: boolean
  error: unknown
  onReply: (item: ActivityItem, body: string) => Promise<unknown>
}) {
  if (loading && items.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-card/60 px-3 py-4 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" aria-hidden />
        Loading comments
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/70 bg-card/45 px-4 py-8 text-center">
        <MessageSquare className="mx-auto mb-2 size-5 text-muted-foreground/40" />
        <p className="text-xs font-medium">No conversation yet</p>
        <p className="mt-0.5 text-3xs text-muted-foreground">
          General and file review comments will appear here.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2.5">
      {error ? (
        <p className="px-1 text-3xs text-destructive">
          File review comments could not be loaded.
        </p>
      ) : null}
      {items.map((item) => (
        <PullRequestCommentCard
          key={item.key}
          author={item.author}
          body={item.body}
          createdAt={item.createdAt}
          context={item.context}
          reviewComment={item.reviewComment}
          diff={item.diff}
          onReply={(body) => onReply(item, body)}
        />
      ))}
    </div>
  )
}

export function GitlabMergeRequestDetail({
  ctx,
  number,
  onBack,
}: {
  ctx: RepoContext
  number: number
  onBack: () => void
}) {
  const { data: mr, isLoading, error } = useMergeRequest(ctx, number)
  const {
    data: review,
    isLoading: reviewLoading,
    error: reviewError,
  } = useMergeRequestReview(ctx, number, true)
  const comment = useCommentMergeRequest(ctx)
  const createReviewComment = useCreateMergeRequestReviewComment(ctx, number)
  const replyToReviewComment = useReplyToMergeRequestReviewComment(ctx, number)
  const checkout = useCheckoutMergeRequest(ctx)
  const merge = useMergeMergeRequest(ctx)
  const [commentBody, setCommentBody] = useState("")
  const [mergeOpen, setMergeOpen] = useState(false)
  const [squash, setSquash] = useState(true)
  const [detailTab, setDetailTab] = useState("overview")

  if (isLoading) return <DetailMessage message="Loading merge request" />
  if (error || !mr) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
        <p className="text-xs text-muted-foreground">
          {error ? parseApiError(error) : "Merge request not found"}
        </p>
        <Button size="sm" variant="outline" onClick={onBack}>
          Back to merge requests
        </Button>
      </div>
    )
  }

  const isOpen = mr.state.toLowerCase() === "opened"
  const pending = comment.isPending || checkout.isPending || merge.isPending
  const reviewFilesByPath = new Map(
    (review?.files ?? []).map((file) => [file.path, file] as const)
  )
  const activity: ActivityItem[] = [
    ...mr.comments.map((item) => ({
      key: `conversation-${item.id}`,
      author: item.author,
      body: item.body,
      createdAt: item.createdAt,
      context: "Conversation",
      reviewComment: false,
    })),
    ...(review?.comments ?? []).map((item) => {
      const line = item.line ?? item.originalLine
      const patch = reviewFilesByPath.get(item.path)?.patch
      return {
        key: `review-${item.id}`,
        author: item.author,
        body: item.body,
        createdAt: item.createdAt,
        context: line
          ? `${item.path} · ${item.side === "LEFT" ? "Old" : "New"} line ${line}`
          : item.path,
        reviewComment: true,
        discussionId: item.discussionId,
        diff: patch ? { patch, line, side: item.side } : undefined,
      }
    }),
  ].sort(
    (left, right) =>
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  )
  const repositoryUrl = mr.url.replace(/\/-\/merge_requests\/\d+\/?$/, "")

  function submitComment() {
    const body = commentBody.trim()
    if (!body) return
    comment.mutate(
      { number, body },
      {
        onSuccess: () => {
          setCommentBody("")
          toast.success("Comment added")
        },
        onError: (commentError) =>
          toast.error("Couldn't add comment", {
            description: parseApiError(commentError),
          }),
      }
    )
  }

  async function replyToActivity(item: ActivityItem, body: string) {
    if (item.discussionId) {
      return replyToReviewComment.mutateAsync({
        discussionId: item.discussionId,
        body,
      })
    }
    const mention = item.author ? `@${item.author} ` : ""
    return comment.mutateAsync({
      number,
      body: body.startsWith(mention) ? body : `${mention}${body}`,
    })
  }

  function createInlineComment(input: CodeReviewCommentInput) {
    if (!input.baseSha || !input.startSha) {
      return Promise.reject(new Error("GitLab diff references are missing"))
    }
    return createReviewComment.mutateAsync({
      body: input.body,
      baseSha: input.baseSha,
      startSha: input.startSha,
      headSha: input.headSha,
      path: input.path,
      previousPath: input.previousPath,
      side: input.side,
      line: input.line,
      oldLine: input.oldLine,
      newLine: input.newLine,
    })
  }

  return (
    <div className="@container/pr flex h-full min-h-0 flex-col bg-muted/[0.08]">
      <div className="shrink-0 p-2 pb-0">
        <div className="flex min-h-11 items-center gap-2 rounded-xl border border-border/60 bg-background/85 px-2 py-1.5 shadow-sm shadow-black/[0.03] backdrop-blur">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onBack}
            aria-label="Back to merge requests"
          >
            <ArrowLeft data-icon="inline-start" />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-foreground/90">
              {mr.title}
            </p>
            <p className="truncate text-3xs text-muted-foreground/60">
              Merge request !{mr.number} · {mr.author ?? "Unknown author"}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void openExternal(mr.url)}
            aria-label="Open on GitLab"
          >
            <ExternalLink data-icon="inline-start" />
          </Button>
        </div>
      </div>

      <Tabs
        value={detailTab}
        onValueChange={setDetailTab}
        className="min-h-0 flex-1 gap-0 overflow-hidden"
      >
        <TabsList className="mx-2 my-2 h-8 max-w-[calc(100%-1rem)] shrink-0 self-start overflow-x-auto rounded-full border border-border/55 bg-background/75 p-1 shadow-xs">
          <TabsTrigger
            value="overview"
            className="h-6 flex-none rounded-full px-2.5 has-data-[icon=inline-start]:pl-2 data-active:bg-primary data-active:text-primary-foreground data-active:shadow-sm"
          >
            <CircleDot data-icon="inline-start" />
            Overview
          </TabsTrigger>
          <TabsTrigger
            value="files"
            className="h-6 flex-none rounded-full px-2.5 has-data-[icon=inline-start]:pl-2 data-active:bg-primary data-active:text-primary-foreground data-active:shadow-sm"
          >
            <GitMerge data-icon="inline-start" />
            Files
            <span className="rounded-full bg-foreground/5 px-1.5 text-3xs text-current tabular-nums">
              {mr.changedFiles}
            </span>
          </TabsTrigger>
          <TabsTrigger
            value="commits"
            className="h-6 flex-none rounded-full px-2.5 has-data-[icon=inline-start]:pl-2 data-active:bg-primary data-active:text-primary-foreground data-active:shadow-sm"
          >
            <GitCommitHorizontal data-icon="inline-start" />
            Commits
            <span className="rounded-full bg-foreground/5 px-1.5 text-3xs text-current tabular-nums">
              {mr.commits.length}
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="overview"
          className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 @sm/pr:px-3"
        >
          <div className="flex flex-col gap-2.5">
            <section className="rounded-xl border border-border/60 bg-card/70 p-3 shadow-sm shadow-black/[0.025]">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant={isOpen ? "default" : "secondary"}>
                  {mr.state}
                </Badge>
                {mr.isDraft ? <Badge variant="outline">Draft</Badge> : null}
                {mr.mergeStatus ? (
                  <Badge variant="outline">{mr.mergeStatus}</Badge>
                ) : null}
              </div>
              <div className="mt-3 flex min-w-0 items-center gap-2 rounded-lg border border-border/45 bg-background/65 px-2.5 py-2 text-xs text-muted-foreground">
                <GitBranch className="size-3.5 shrink-0" aria-hidden />
                <span className="min-w-0 truncate font-mono">
                  {mr.headRefName}
                </span>
                <span className="shrink-0 text-muted-foreground/40">→</span>
                <span className="min-w-0 truncate font-mono">
                  {mr.baseRefName}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-4 divide-x divide-border/50 rounded-lg bg-muted/35 py-2 text-center">
                <div>
                  <p className="text-xs font-semibold tabular-nums">
                    {mr.changedFiles}
                  </p>
                  <p className="text-3xs text-muted-foreground">Files</p>
                </div>
                <div>
                  <p className="text-xs font-semibold tabular-nums">
                    {mr.commits.length}
                  </p>
                  <p className="text-3xs text-muted-foreground">Commits</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-diff-add tabular-nums">
                    +{mr.additions}
                  </p>
                  <p className="text-3xs text-muted-foreground">Added</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-diff-remove tabular-nums">
                    -{mr.deletions}
                  </p>
                  <p className="text-3xs text-muted-foreground">Removed</p>
                </div>
              </div>
            </section>

            {mr.description ? (
              <section className="rounded-xl border border-border/60 bg-card/70 p-3 shadow-sm shadow-black/[0.025]">
                <SectionLabel>Description</SectionLabel>
                <div className="mt-2">
                  <RemoteMarkdown content={mr.description} />
                </div>
              </section>
            ) : null}

            {mr.pipeline ? (
              <section className="overflow-hidden rounded-xl border border-border/60 bg-card/70 shadow-sm shadow-black/[0.025]">
                <div className="flex items-center justify-between gap-2 border-b border-border/45 px-3 py-2.5">
                  <SectionLabel>Pipeline</SectionLabel>
                  <Badge
                    variant={
                      mr.pipeline.status === "success"
                        ? "secondary"
                        : mr.pipeline.status === "failed"
                          ? "destructive"
                          : "outline"
                    }
                  >
                    {mr.pipeline.status}
                  </Badge>
                </div>
                <div className="divide-y divide-border/40">
                  {mr.pipeline.jobs.map((job) => (
                    <button
                      key={`${job.stage}-${job.name}`}
                      type="button"
                      disabled={!job.link}
                      onClick={() => job.link && void openExternal(job.link)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-muted/30 disabled:cursor-default"
                    >
                      <span className="min-w-0 truncate">
                        {job.stage ? `${job.stage} / ` : ""}
                        {job.name}
                      </span>
                      <Badge
                        variant={
                          job.bucket === "pass"
                            ? "secondary"
                            : job.bucket === "fail"
                              ? "destructive"
                              : "outline"
                        }
                      >
                        {job.state}
                      </Badge>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="flex flex-col gap-2">
              <div className="flex items-center gap-2 px-0.5">
                <SectionLabel>Comments</SectionLabel>
                {activity.length > 0 ? (
                  <Badge variant="secondary">{activity.length}</Badge>
                ) : null}
              </div>
              <ActivityList
                items={activity}
                loading={reviewLoading}
                error={reviewError}
                onReply={replyToActivity}
              />
              <div className="rounded-xl border border-border/60 bg-card/75 p-2.5 shadow-sm shadow-black/[0.025]">
                <Textarea
                  value={commentBody}
                  onChange={(event) => setCommentBody(event.target.value)}
                  placeholder="Add to the conversation…"
                  disabled={pending}
                  aria-label="Merge request comment"
                  className="min-h-24 resize-y border-border/50 bg-background/70"
                />
                <div className="mt-2 flex justify-end">
                  <Button
                    size="sm"
                    onClick={submitComment}
                    disabled={!commentBody.trim() || pending}
                  >
                    <MessageSquare data-icon="inline-start" />
                    Comment
                  </Button>
                </div>
              </div>
            </section>
          </div>
        </TabsContent>

        <TabsContent value="files" className="min-h-0 flex-1 overflow-hidden">
          <CodeReviewFiles
            review={review}
            isLoading={reviewLoading}
            error={reviewError}
            createCommentPending={createReviewComment.isPending}
            onCreateComment={createInlineComment}
          />
        </TabsContent>

        <TabsContent
          value="commits"
          className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 @sm/pr:px-3"
        >
          <PullRequestCommits
            commits={mr.commits}
            repositoryUrl={repositoryUrl}
            commitUrl={(oid) => `${repositoryUrl}/-/commit/${oid}`}
          />
        </TabsContent>
      </Tabs>

      {isOpen ? (
        <div className="mx-2 mb-2 flex shrink-0 items-center justify-end gap-2 rounded-xl border border-border/60 bg-background/90 p-2 shadow-md backdrop-blur">
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() =>
              checkout.mutate(number, {
                onSuccess: () => toast.success("Merge request checked out"),
                onError: (checkoutError) =>
                  toast.error("Couldn't check out merge request", {
                    description: parseApiError(checkoutError),
                  }),
              })
            }
          >
            <GitBranch data-icon="inline-start" />
            Checkout
          </Button>
          <Button
            size="sm"
            disabled={pending}
            onClick={() => setMergeOpen(true)}
          >
            <GitMerge data-icon="inline-start" />
            Merge
          </Button>
        </div>
      ) : null}

      <AlertDialog open={mergeOpen} onOpenChange={setMergeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Merge request !{number}?</AlertDialogTitle>
            <AlertDialogDescription>
              This action updates the remote repository and cannot be undone
              from this panel.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-2.5">
            <div>
              <p className="text-xs font-medium">Squash commits</p>
              <p className="text-3xs text-muted-foreground">
                Combine this merge request into one commit.
              </p>
            </div>
            <Button
              type="button"
              size="xs"
              variant={squash ? "default" : "outline"}
              onClick={() => setSquash((value) => !value)}
            >
              {squash ? "Enabled" : "Disabled"}
            </Button>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={merge.isPending}
              onClick={() =>
                merge.mutate(
                  { number, squash },
                  {
                    onSuccess: () => {
                      setMergeOpen(false)
                      toast.success("Merge request merged")
                    },
                    onError: (mergeError) =>
                      toast.error("Couldn't merge merge request", {
                        description: parseApiError(mergeError),
                      }),
                  }
                )
              }
            >
              Merge
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
