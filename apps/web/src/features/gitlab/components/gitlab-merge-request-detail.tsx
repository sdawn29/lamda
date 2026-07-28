import { useState } from "react"
import {
  ChevronRight,
  CircleDot,
  CircleUserRound,
  Clock,
  Copy,
  GitBranch,
  GitCommitHorizontal,
  GitMerge,
} from "lucide-react"
import { toast } from "sonner"

import { parseApiError } from "@/features/git"
import { useQueryFreshness } from "@/shared/hooks/use-query-freshness"
import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import { SectionLabel } from "@/shared/ui/section-label"
import { Switch } from "@/shared/ui/switch"
import { Tabs, TabsContent } from "@/shared/ui/tabs"
import {
  ActivityList,
  checksSummaryText,
  CodeReviewFiles,
  CollapsibleChecksSummary,
  CommentCard,
  CommentComposer,
  CommitList,
  DetailActionsFooter,
  DetailHeader,
  DetailNotFound,
  DetailTab,
  DetailTabsList,
  DetailTopBar,
  LastUpdatedLabel,
  MergeDialog,
  mergeButtonState,
  MergeReadinessBanner,
  mergeReadinessKind,
  PanelMessage,
  PropertyRow,
  readinessLabel,
  ReviewerAvatar,
  reviewItemStateIcon,
  SectionHeading,
  StatusBadge,
  summarizeChecks,
  type ActivityItem,
  type CodeReviewCommentInput,
} from "@/features/review"
import { fetchCommitDiff } from "../api"
import {
  useCheckoutMergeRequest,
  useCommentMergeRequest,
  useCreateMergeRequestReviewComment,
  useMergeMergeRequest,
  useReplyToMergeRequestReviewComment,
} from "../mutations"
import { gitlabKeys, useMergeRequest, useMergeRequestReview } from "../queries"
import type { RepoContext } from "../types"

interface MrActivityItem extends ActivityItem {
  discussionId?: string
}

/** GitLab merge-request detail; mirrors the GitHub PR detail page. */
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
  const lastUpdated = useQueryFreshness(gitlabKeys.mr(ctx, number))

  if (isLoading) return <PanelMessage loading message="Loading merge request" />
  if (error || !mr) {
    return (
      <DetailNotFound
        message={error ? parseApiError(error) : "Merge request not found"}
        backLabel="Back to merge requests"
        onBack={onBack}
      />
    )
  }

  const isOpen = mr.state.toLowerCase() === "opened"
  const pending = comment.isPending || checkout.isPending || merge.isPending
  const readiness = mergeReadinessKind(mr.state, mr.isDraft, mr.mergeStatus)
  const reviewFilesByPath = new Map(
    (review?.files ?? []).map((file) => [file.path, file] as const)
  )
  const activity: MrActivityItem[] = [
    ...mr.comments.map((item) => ({
      key: `conversation-${item.id}`,
      author: item.author,
      avatarUrl: item.authorAvatarUrl,
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
        avatarUrl: item.authorAvatarUrl,
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
  const jobsSummary = summarizeChecks(
    (mr.pipeline?.jobs ?? []).map((job) => ({
      name: job.name,
      bucket: job.bucket,
      state: job.state,
      link: job.link,
      workflow: job.stage,
    }))
  )
  const checksText = checksSummaryText(jobsSummary, {
    singular: "job",
    plural: "jobs",
    none: "No pipeline",
  })
  const mergeState = mergeButtonState({
    readiness,
    checksBucket: jobsSummary.bucket,
    autoMergeEnabled: mr.autoMergeEnabled,
  })

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

  async function replyToActivity(item: MrActivityItem, body: string) {
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
      <DetailTopBar
        onBack={onBack}
        backLabel="Back to merge requests"
        stateIcon={reviewItemStateIcon(mr.state, mr.isDraft, "opened")}
        title={`Merge request !${mr.number}`}
        url={mr.url}
        openLabel="Open on GitLab"
        meta={<LastUpdatedLabel updatedAt={lastUpdated} />}
      />

      <Tabs
        value={detailTab}
        onValueChange={setDetailTab}
        className="min-h-0 flex-1 gap-0 overflow-hidden"
      >
        <DetailTabsList>
          <DetailTab
            value="overview"
            icon={<CircleDot data-icon="inline-start" />}
            label="Overview"
          />
          <DetailTab
            value="files"
            icon={<GitMerge data-icon="inline-start" />}
            label="Files"
            count={mr.changedFiles}
          />
          <DetailTab
            value="commits"
            icon={<GitCommitHorizontal data-icon="inline-start" />}
            label="Commits"
            count={mr.commits.length}
          />
        </DetailTabsList>

        <TabsContent
          value="overview"
          className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 @sm/pr:px-3"
        >
          <div className="flex flex-col gap-2.5">
            <DetailHeader
              title={mr.title}
              avatarSrc={mr.authorAvatarUrl}
              author={mr.author}
              createdAt={mr.createdAt}
              status={
                mr.autoMergeEnabled
                  ? "Auto-merge enabled"
                  : readinessLabel(readiness)
              }
            >
              <PropertyRow
                icon={<GitBranch className="size-3.5 shrink-0" aria-hidden />}
                label="Branch"
              >
                <span className="min-w-0 truncate font-mono">
                  {mr.headRefName}
                </span>
                <ChevronRight
                  className="size-3 shrink-0 text-muted-foreground/40"
                  aria-hidden
                />
                <span className="min-w-0 truncate font-mono">
                  {mr.baseRefName}
                </span>
                <span className="ml-1 shrink-0 font-medium text-diff-add tabular-nums">
                  +{mr.additions}
                </span>
                <span className="shrink-0 font-medium text-diff-remove tabular-nums">
                  -{mr.deletions}
                </span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="shrink-0"
                  aria-label="Copy source branch name"
                  title="Copy source branch name"
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(mr.headRefName)
                      .then(() => toast.success("Branch name copied"))
                  }
                >
                  <Copy className="size-3" aria-hidden />
                </Button>
              </PropertyRow>
              <PropertyRow
                icon={
                  <CircleUserRound className="size-3.5 shrink-0" aria-hidden />
                }
                label="Reviewers"
              >
                {mr.reviewers.length > 0 ? (
                  <div className="flex items-center -space-x-1">
                    {mr.reviewers.map((reviewer) => (
                      <ReviewerAvatar
                        key={reviewer.login}
                        name={reviewer.name ?? reviewer.login}
                        src={reviewer.avatarUrl}
                      />
                    ))}
                  </div>
                ) : (
                  <span className="text-muted-foreground">No reviewers</span>
                )}
              </PropertyRow>
              <PropertyRow
                icon={<Clock className="size-3.5 shrink-0" aria-hidden />}
                label="Checks"
              >
                {checksText}
              </PropertyRow>
            </DetailHeader>

            <section className="flex flex-col gap-2">
              <SectionHeading
                label={<SectionLabel>Conversation</SectionLabel>}
                count={activity.length}
              />
              {mr.description ? (
                <CommentCard
                  author={mr.author}
                  avatarUrl={mr.authorAvatarUrl}
                  body={mr.description}
                  createdAt={mr.createdAt}
                  context="Description"
                />
              ) : null}
              <ActivityList
                items={activity}
                loading={reviewLoading}
                error={reviewError}
                onReply={replyToActivity}
              />
              <CommentComposer
                value={commentBody}
                onChange={setCommentBody}
                disabled={pending}
                ariaLabel="Merge request comment"
                onSubmit={submitComment}
              />
            </section>

            <section className="rounded-xl border border-border/60 bg-card/70 p-3 shadow-sm shadow-black/[0.025] dark:shadow-black/20">
              <div className="flex flex-wrap items-center gap-1.5">
                <MergeReadinessBanner
                  kind={readiness}
                  baseRefName={mr.baseRefName}
                />
                {mr.isDraft && readiness !== "draft" ? (
                  <Badge variant="outline">Draft</Badge>
                ) : null}
                {readiness === "draft" ? (
                  <StatusBadge value={mr.mergeStatus} />
                ) : null}
              </div>
              {mr.pipeline && mr.pipeline.jobs.length > 0 ? (
                <div className="mt-2.5">
                  <CollapsibleChecksSummary
                    noun="jobs"
                    items={mr.pipeline.jobs.map((job) => ({
                      name: job.name,
                      state: job.state,
                      bucket: job.bucket,
                      link: job.link,
                      group: job.stage,
                    }))}
                  />
                </div>
              ) : null}
              {isOpen ? (
                <DetailActionsFooter
                  pending={pending}
                  mergeState={mergeState}
                  onCheckout={() =>
                    checkout.mutate(number, {
                      onSuccess: () =>
                        toast.success("Merge request checked out"),
                      onError: (checkoutError) =>
                        toast.error("Couldn't check out merge request", {
                          description: parseApiError(checkoutError),
                        }),
                    })
                  }
                  onMerge={() => setMergeOpen(true)}
                />
              ) : null}
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
            onReplyToComment={(comment, body) => {
              if (!comment.discussionId) {
                return Promise.reject(
                  new Error("GitLab discussion reference is missing")
                )
              }
              return replyToReviewComment.mutateAsync({
                discussionId: comment.discussionId,
                body,
              })
            }}
          />
        </TabsContent>

        <TabsContent
          value="commits"
          className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 @sm/pr:px-3"
        >
          <CommitList
            commits={mr.commits}
            repositoryUrl={repositoryUrl}
            commitUrl={(oid) => `${repositoryUrl}/-/commit/${oid}`}
            getCommitDiff={(oid) => fetchCommitDiff(ctx, oid)}
          />
        </TabsContent>
      </Tabs>

      <MergeDialog
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        subject={`merge request !${number}`}
        auto={mergeState.auto}
        pending={merge.isPending}
        onConfirm={() =>
          merge.mutate(
            { number, squash, auto: mergeState.auto },
            {
              onSuccess: () => {
                setMergeOpen(false)
                toast.success(
                  mergeState.auto ? "Auto-merge enabled" : "Merge request merged"
                )
              },
              onError: (mergeError) =>
                toast.error(
                  mergeState.auto
                    ? "Couldn't enable auto-merge"
                    : "Couldn't merge merge request",
                  { description: parseApiError(mergeError) }
                ),
            }
          )
        }
      >
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-2.5">
          <div>
            <label htmlFor="mr-squash" className="text-xs font-medium">
              Squash commits
            </label>
            <p className="text-3xs text-muted-foreground">
              Combine this merge request into one commit.
            </p>
          </div>
          <Switch id="mr-squash" checked={squash} onCheckedChange={setSquash} />
        </div>
      </MergeDialog>
    </div>
  )
}
