import { useState } from "react"
import {
  ChevronRight,
  CircleDot,
  CircleUserRound,
  Clock,
  Copy,
  GitBranch,
  GitCommitHorizontal,
  GitPullRequest,
  GitPullRequestArrow,
  MessageCircle,
  Tag,
  UploadCloud,
} from "lucide-react"
import { Github } from "@lobehub/icons"
import { toast } from "sonner"
import { useIsFetching, useQueryClient } from "@tanstack/react-query"

import { useQueryFreshness } from "@/shared/hooks/use-query-freshness"
import { formatRelativeDate } from "@/shared/lib/formatters"
import { parseApiError } from "@/features/git"
import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import { SectionLabel } from "@/shared/ui/section-label"
import { Tabs, TabsContent } from "@/shared/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/shared/ui/toggle-group"
import {
  ActivityList,
  checksSummaryText,
  CiChecksBadge,
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
  EmptyPlaceholder,
  githubAvatarUrl,
  humanizeStatus,
  LastUpdatedLabel,
  ListCard,
  ListState,
  MergeDialog,
  mergeButtonState,
  MergeReadinessBanner,
  mergeReadinessKind,
  PanelMessage,
  PropertyRow,
  PublishRepositoryDialog,
  readinessLabel,
  RefreshButton,
  RepoPanelHeader,
  ReviewerAvatar,
  reviewItemStateIcon,
  Row,
  SectionHeading,
  StatusBadge,
  summarizeChecks,
  type ActivityItem,
} from "@/features/review"
import { fetchCommitDiff } from "../api"
import {
  githubKeys,
  useChecks,
  useGhStatus,
  useIssue,
  useIssues,
  usePullRequest,
  usePullRequestReview,
  usePullRequests,
  useRepoInfo,
} from "../queries"
import {
  useCheckoutPullRequest,
  useCommentIssue,
  useCommentPullRequest,
  useMergePullRequest,
  usePublishRepository,
  useReplyToReviewComment,
} from "../mutations"
import { CreatePrDialog } from "./create-pr-dialog"
import { PullRequestFiles } from "./pull-request-files"
import type {
  MergeMethod,
  PrState,
  PullRequestReviewComment,
  RepoContext,
} from "../types"

/**
 * GitHub view for the review panel — repo overview, current-branch CI status,
 * and open pull requests + issues, with a Create PR action. Scoped to the
 * thread's session (its worktree). All shared visuals come from
 * `@/features/review`; this file wires GitHub data and mutations into them.
 */
export function GithubReviewView({
  sessionId,
  branch,
}: {
  sessionId: string
  branch: string | null
}) {
  const ctx: RepoContext = { id: sessionId }
  const { data: status, isLoading: statusLoading } = useGhStatus(ctx)
  const connected = Boolean(status?.installed && status?.authenticated)
  const { data: repo, isLoading: repoLoading } = useRepoInfo(ctx, connected)
  const [createOpen, setCreateOpen] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  const [selectedPr, setSelectedPr] = useState<number | null>(null)
  const [selectedIssue, setSelectedIssue] = useState<number | null>(null)
  const qc = useQueryClient()
  const panelFetching = useIsFetching({ queryKey: githubKeys.all }) > 0
  const lastUpdated = useQueryFreshness(githubKeys.all)

  const { data: checks = [] } = useChecks(ctx, {}, connected && Boolean(repo))

  if (statusLoading) {
    return <PanelMessage loading message="Checking GitHub" />
  }

  if (!connected) {
    return (
      <PanelMessage
        icon={<Github size={20} />}
        message={
          status?.installed
            ? "Sign in to GitHub to manage pull requests and issues."
            : "Install the GitHub CLI (gh) to connect your account."
        }
        hint="Open Settings → Git to connect."
      />
    )
  }

  if (repoLoading) {
    return <PanelMessage loading message="Loading repository" />
  }

  if (!repo) {
    return (
      <>
        <PanelMessage
          icon={<Github size={20} />}
          message="No GitHub repository found for this folder."
          hint="Publish this repository to GitHub to enable PRs, issues, and checks."
        >
          <Button
            size="sm"
            className="h-7 gap-1.5 px-2.5 text-xs"
            onClick={() => setPublishOpen(true)}
          >
            <UploadCloud className="size-3.5" />
            Publish to GitHub
          </Button>
        </PanelMessage>
        <GithubPublishDialog
          open={publishOpen}
          onOpenChange={setPublishOpen}
          ctx={ctx}
        />
      </>
    )
  }

  if (selectedPr != null) {
    return (
      <GithubPullRequestDetail
        ctx={ctx}
        number={selectedPr}
        onBack={() => setSelectedPr(null)}
      />
    )
  }

  if (selectedIssue != null) {
    return (
      <GithubIssueDetail
        ctx={ctx}
        number={selectedIssue}
        onBack={() => setSelectedIssue(null)}
      />
    )
  }

  return (
    <div className="@container/panel flex h-full min-h-0 flex-col bg-muted/[0.08]">
      <RepoPanelHeader
        icon={<Github size={15} />}
        name={repo.nameWithOwner}
        subtitle="GitHub repository"
        url={repo.url}
      >
        <CiChecksBadge checks={checks} />
        <LastUpdatedLabel updatedAt={lastUpdated} />
        <RefreshButton
          spinning={panelFetching}
          onClick={() => void qc.invalidateQueries({ queryKey: githubKeys.all })}
          label="Refresh GitHub data"
        />
        <Button
          size="sm"
          className="h-7 gap-1.5 px-2.5 text-xs"
          onClick={() => setCreateOpen(true)}
        >
          <GitPullRequestArrow className="size-3.5" />
          Create PR
        </Button>
      </RepoPanelHeader>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-2 @sm/panel:p-3">
        <PullRequestsSection ctx={ctx} onSelect={setSelectedPr} />
        <IssuesSection ctx={ctx} onSelect={setSelectedIssue} />
      </div>

      <CreatePrDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        ctx={ctx}
        headBranch={branch}
      />
    </div>
  )
}

function GithubPublishDialog({
  open,
  onOpenChange,
  ctx,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  ctx: RepoContext
}) {
  const publishRepository = usePublishRepository(ctx)

  return (
    <PublishRepositoryDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Publish to GitHub"
      description="Create a GitHub repository for this folder, add a GitHub remote, and push the current branch."
      nameLabel="Repository name"
      namePlaceholder="Defaults to folder name"
      nameDescription="Use `owner/name` to publish under a specific organization."
      pending={publishRepository.isPending}
      onPublish={(name, visibility, close) =>
        publishRepository.mutate(
          { name, visibility },
          {
            onSuccess: (repo) => {
              toast.success(`Published ${repo.nameWithOwner}`)
              close()
            },
            onError: (error) =>
              toast.error("Couldn't publish repository", {
                description: parseApiError(error),
              }),
          }
        )
      }
    />
  )
}

function emptyPrMessage(state: PrState): string {
  if (state === "closed") return "No closed pull requests"
  if (state === "all") return "No pull requests"
  return "No open pull requests"
}

function PullRequestsSection({
  ctx,
  onSelect,
}: {
  ctx: RepoContext
  onSelect: (number: number) => void
}) {
  const [state, setState] = useState<PrState>("open")
  const { data: prs = [], isLoading } = usePullRequests(ctx, state)
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
        <SectionLabel>Pull requests</SectionLabel>
        <ToggleGroup
          size="sm"
          variant="outline"
          value={[state]}
          onValueChange={(values) => {
            const next = values.find((value) => value !== state)
            if (next === "open" || next === "closed" || next === "all") {
              setState(next)
            }
          }}
        >
          <ToggleGroupItem value="open">Open</ToggleGroupItem>
          <ToggleGroupItem value="closed">Closed</ToggleGroupItem>
          <ToggleGroupItem value="all">All</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <ListCard>
        {isLoading ? <ListState loading empty={false} message="" /> : null}
        {!isLoading && prs.length === 0 ? (
          state === "open" ? (
            <div className="flex flex-col items-center gap-1.5 px-4 py-8 text-center">
              <GitPullRequestArrow className="size-5 text-muted-foreground/35" />
              <p className="text-2xs text-muted-foreground/50">
                {emptyPrMessage(state)}
              </p>
            </div>
          ) : (
            <ListState loading={false} empty message={emptyPrMessage(state)} />
          )
        ) : null}
        {prs.map((pr) => (
          <Row
            key={pr.number}
            onClick={() => onSelect(pr.number)}
            external={false}
            icon={reviewItemStateIcon(pr.state, pr.isDraft, "open")}
            title={pr.title}
            titleBadge={
              pr.isDraft ? (
                <Badge variant="outline" className="shrink-0">
                  Draft
                </Badge>
              ) : null
            }
            meta={`#${pr.number}${pr.author ? ` · ${pr.author}` : ""} · updated ${formatRelativeDate(pr.updatedAt)}`}
          />
        ))}
      </ListCard>
    </section>
  )
}

interface PullRequestActivityItem extends ActivityItem {
  reviewCommentId?: number
}

function reviewCommentContext(comment: PullRequestReviewComment): string {
  const line = comment.line ?? comment.originalLine
  const side = comment.side === "LEFT" ? "Old" : "New"
  return line ? `${comment.path} · ${side} line ${line}` : comment.path
}

function GithubPullRequestDetail({
  ctx,
  number,
  onBack,
}: {
  ctx: RepoContext
  number: number
  onBack: () => void
}) {
  const { data: pr, isLoading, error } = usePullRequest(ctx, number)
  const {
    data: review,
    isLoading: reviewLoading,
    error: reviewError,
  } = usePullRequestReview(ctx, number, true)
  const comment = useCommentPullRequest(ctx)
  const replyToReviewComment = useReplyToReviewComment(ctx, number)
  const checkout = useCheckoutPullRequest(ctx)
  const merge = useMergePullRequest(ctx)
  const [commentBody, setCommentBody] = useState("")
  const [mergeOpen, setMergeOpen] = useState(false)
  const [mergeMethod, setMergeMethod] = useState<MergeMethod>("squash")
  const [detailTab, setDetailTab] = useState("overview")
  const lastUpdated = useQueryFreshness(githubKeys.pr(ctx, number))

  if (isLoading) return <PanelMessage loading message="Loading pull request" />
  if (error || !pr) {
    return (
      <DetailNotFound
        message={error ? parseApiError(error) : "Pull request not found"}
        backLabel="Back to pull requests"
        onBack={onBack}
      />
    )
  }

  const isOpen = pr.state.toLowerCase() === "open"
  const pending = comment.isPending || checkout.isPending || merge.isPending
  const readiness = mergeReadinessKind(pr.state, pr.isDraft, pr.mergeable)
  const reviewFilesByPath = new Map(
    (review?.files ?? []).map((file) => [file.path, file] as const)
  )
  const activity: PullRequestActivityItem[] = [
    ...pr.comments.map((item, index) => ({
      key: `conversation-${item.createdAt}-${index}`,
      author: item.author,
      avatarUrl: githubAvatarUrl(item.author),
      body: item.body,
      createdAt: item.createdAt,
      context: "Conversation",
      reviewComment: false,
    })),
    ...(review?.comments ?? []).map((item) => {
      const patch = reviewFilesByPath.get(item.path)?.patch
      return {
        key: `review-${item.id}`,
        author: item.author,
        avatarUrl: item.authorAvatarUrl ?? githubAvatarUrl(item.author),
        body: item.body,
        createdAt: item.createdAt,
        context: reviewCommentContext(item),
        reviewComment: true,
        reviewCommentId: item.inReplyToId ?? item.id,
        diff: patch
          ? {
              patch,
              line: item.line ?? item.originalLine,
              side: item.side,
            }
          : undefined,
      }
    }),
  ].sort(
    (left, right) =>
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  )
  const commentCount = activity.length
  const repositoryUrl = pr.url.replace(/\/pull\/\d+\/?$/, "")
  const reviewers = (() => {
    const byLogin = new Map<string, string>()
    for (const review of pr.latestReviews) {
      if (review.author) byLogin.set(review.author, review.state)
    }
    for (const login of pr.reviewRequests) {
      if (!byLogin.has(login)) byLogin.set(login, "PENDING")
    }
    return [...byLogin.entries()].map(([login, state]) => ({ login, state }))
  })()
  const checksSummary = summarizeChecks(pr.checks)
  const checksText = checksSummaryText(checksSummary, {
    singular: "check",
    plural: "checks",
    none: "No CI checks",
  })
  const mergeState = mergeButtonState({
    readiness,
    checksBucket: checksSummary.bucket,
    autoMergeEnabled: pr.autoMergeEnabled,
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

  async function replyToActivity(item: PullRequestActivityItem, body: string) {
    if (item.reviewCommentId) {
      return replyToReviewComment.mutateAsync({
        commentId: item.reviewCommentId,
        body,
      })
    }

    const mention = item.author ? `@${item.author} ` : ""
    const replyBody = body.startsWith(mention) ? body : `${mention}${body}`
    return comment.mutateAsync({ number, body: replyBody })
  }

  return (
    <div className="@container/pr flex h-full min-h-0 flex-col bg-muted/[0.08]">
      <DetailTopBar
        onBack={onBack}
        backLabel="Back to pull requests"
        stateIcon={reviewItemStateIcon(pr.state, pr.isDraft, "open")}
        title={`Pull request #${pr.number}`}
        url={pr.url}
        openLabel="Open on GitHub"
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
            icon={<GitPullRequest data-icon="inline-start" />}
            label="Files"
            count={pr.changedFiles}
            title={`${pr.changedFiles} changed files`}
          />
          <DetailTab
            value="commits"
            icon={<GitCommitHorizontal data-icon="inline-start" />}
            label="Commits"
            count={pr.commits.length}
          />
        </DetailTabsList>

        <TabsContent
          value="overview"
          className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 @sm/pr:px-3"
        >
          <div className="flex flex-col gap-2.5">
            <DetailHeader
              title={pr.title}
              avatarSrc={githubAvatarUrl(pr.author)}
              author={pr.author}
              createdAt={pr.createdAt}
              status={
                pr.autoMergeEnabled
                  ? "Auto-merge enabled"
                  : readinessLabel(readiness)
              }
            >
              <PropertyRow
                icon={<GitBranch className="size-3.5 shrink-0" aria-hidden />}
                label="Branch"
              >
                <span className="min-w-0 truncate font-mono">
                  {pr.headRefName}
                </span>
                <ChevronRight
                  className="size-3 shrink-0 text-muted-foreground/40"
                  aria-hidden
                />
                <span className="min-w-0 truncate font-mono">
                  {pr.baseRefName}
                </span>
                <span className="ml-1 shrink-0 font-medium text-diff-add tabular-nums">
                  +{pr.additions}
                </span>
                <span className="shrink-0 font-medium text-diff-remove tabular-nums">
                  -{pr.deletions}
                </span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="shrink-0"
                  aria-label="Copy source branch name"
                  title="Copy source branch name"
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(pr.headRefName)
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
                {reviewers.length > 0 ? (
                  <div className="flex items-center -space-x-1">
                    {reviewers.map((reviewer) => (
                      <ReviewerAvatar
                        key={reviewer.login}
                        name={reviewer.login}
                        src={githubAvatarUrl(reviewer.login)}
                        state={reviewer.state}
                      />
                    ))}
                  </div>
                ) : (
                  <span className="text-muted-foreground">No reviewers</span>
                )}
              </PropertyRow>
              <PropertyRow
                icon={<MessageCircle className="size-3.5 shrink-0" aria-hidden />}
                label="Comments"
              >
                {commentCount > 0
                  ? `${commentCount} ${commentCount === 1 ? "comment" : "comments"}`
                  : "No comments"}
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
                count={commentCount}
              />
              {pr.body ? (
                <CommentCard
                  author={pr.author}
                  avatarUrl={githubAvatarUrl(pr.author)}
                  body={pr.body}
                  createdAt={pr.createdAt}
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
                ariaLabel="Pull request comment"
                onSubmit={submitComment}
              />
            </section>

            <section className="rounded-xl border border-border/60 bg-card/70 p-3 shadow-sm shadow-black/[0.025] dark:shadow-black/20">
              <div className="flex flex-wrap items-center gap-1.5">
                <MergeReadinessBanner
                  kind={readiness}
                  baseRefName={pr.baseRefName}
                />
                <StatusBadge value={pr.reviewDecision} />
                {pr.isDraft && readiness !== "draft" ? (
                  <Badge variant="outline">Draft</Badge>
                ) : null}
              </div>
              {pr.checks.length > 0 ? (
                <div className="mt-2.5">
                  <CollapsibleChecksSummary
                    items={pr.checks.map((check) => ({
                      name: check.name,
                      state: check.state,
                      bucket: check.bucket,
                      link: check.link,
                      group: check.workflow,
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
                        toast.success("Pull request checked out"),
                      onError: (checkoutError) =>
                        toast.error("Couldn't check out pull request", {
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
          <PullRequestFiles
            ctx={ctx}
            number={number}
            enabled={detailTab === "files"}
          />
        </TabsContent>

        <TabsContent
          value="commits"
          className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 @sm/pr:px-3"
        >
          <CommitList
            commits={pr.commits}
            repositoryUrl={repositoryUrl}
            getCommitDiff={(oid) => fetchCommitDiff(ctx, oid)}
          />
        </TabsContent>
      </Tabs>

      <MergeDialog
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        subject={`pull request #${number}`}
        auto={mergeState.auto}
        pending={merge.isPending}
        onConfirm={() =>
          merge.mutate(
            { number, method: mergeMethod, auto: mergeState.auto },
            {
              onSuccess: () => {
                setMergeOpen(false)
                toast.success(
                  mergeState.auto ? "Auto-merge enabled" : "Pull request merged"
                )
              },
              onError: (mergeError) =>
                toast.error(
                  mergeState.auto
                    ? "Couldn't enable auto-merge"
                    : "Couldn't merge pull request",
                  { description: parseApiError(mergeError) }
                ),
            }
          )
        }
      >
        <ToggleGroup
          variant="outline"
          value={[mergeMethod]}
          onValueChange={(values) => {
            const next = values.find((value) => value !== mergeMethod)
            if (next === "merge" || next === "squash" || next === "rebase")
              setMergeMethod(next)
          }}
        >
          <ToggleGroupItem value="merge">Merge</ToggleGroupItem>
          <ToggleGroupItem value="squash">Squash</ToggleGroupItem>
          <ToggleGroupItem value="rebase">Rebase</ToggleGroupItem>
        </ToggleGroup>
      </MergeDialog>
    </div>
  )
}

function IssuesSection({
  ctx,
  onSelect,
}: {
  ctx: RepoContext
  onSelect: (number: number) => void
}) {
  const { data: issues = [], isLoading } = useIssues(ctx, "open")
  return (
    <section>
      <div className="mb-2 px-0.5">
        <SectionLabel>Issues</SectionLabel>
      </div>
      <ListCard>
        <ListState
          loading={isLoading}
          empty={issues.length === 0}
          message="No open issues"
        />
        {issues.map((issue) => {
          const labels = issue.labels.slice(0, 2)
          return (
            <Row
              key={issue.number}
              onClick={() => onSelect(issue.number)}
              external={false}
              icon={<CircleDot className="size-3.5 text-emerald-600" />}
              title={issue.title}
              meta={
                <>
                  #{issue.number}
                  {issue.author ? ` · ${issue.author}` : ""} · updated{" "}
                  {formatRelativeDate(issue.updatedAt)}
                  {labels.length ? ` · ${labels.join(", ")}` : ""}
                </>
              }
            />
          )
        })}
      </ListCard>
    </section>
  )
}

function GithubIssueDetail({
  ctx,
  number,
  onBack,
}: {
  ctx: RepoContext
  number: number
  onBack: () => void
}) {
  const { data: issue, isLoading, error } = useIssue(ctx, number)
  const comment = useCommentIssue(ctx)
  const [commentBody, setCommentBody] = useState("")
  const lastUpdated = useQueryFreshness(githubKeys.issue(ctx, number))

  if (isLoading) return <PanelMessage loading message="Loading issue" />
  if (error || !issue) {
    return (
      <DetailNotFound
        message={error ? parseApiError(error) : "Issue not found"}
        backLabel="Back to issues"
        onBack={onBack}
      />
    )
  }

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

  return (
    <div className="@container/pr flex h-full min-h-0 flex-col bg-muted/[0.08]">
      <DetailTopBar
        onBack={onBack}
        backLabel="Back to issues"
        stateIcon={<CircleDot className="size-3.5 text-emerald-600" />}
        title={`Issue #${issue.number}`}
        url={issue.url}
        openLabel="Open on GitHub"
        meta={<LastUpdatedLabel updatedAt={lastUpdated} />}
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 @sm/pr:px-3">
        <div className="flex flex-col gap-2.5">
          <DetailHeader
            title={issue.title}
            avatarSrc={githubAvatarUrl(issue.author)}
            author={issue.author}
            createdAt={issue.createdAt}
            status={humanizeStatus(issue.state).label}
          >
            <PropertyRow
              icon={<Tag className="size-3.5 shrink-0" aria-hidden />}
              label="Labels"
            >
              {issue.labels.length > 0 ? (
                <div className="flex min-w-0 flex-wrap items-center gap-1">
                  {issue.labels.map((label) => (
                    <Badge key={label} variant="outline">
                      {label}
                    </Badge>
                  ))}
                </div>
              ) : (
                <span className="text-muted-foreground">No labels</span>
              )}
            </PropertyRow>
            <PropertyRow
              icon={<MessageCircle className="size-3.5 shrink-0" aria-hidden />}
              label="Comments"
            >
              {issue.comments.length > 0
                ? `${issue.comments.length} ${issue.comments.length === 1 ? "comment" : "comments"}`
                : "No comments"}
            </PropertyRow>
          </DetailHeader>

          <section className="flex flex-col gap-2">
            <SectionHeading
              label={<SectionLabel>Conversation</SectionLabel>}
              count={issue.comments.length}
            />
            {issue.body ? (
              <CommentCard
                author={issue.author}
                avatarUrl={githubAvatarUrl(issue.author)}
                body={issue.body}
                createdAt={issue.createdAt}
                context="Description"
              />
            ) : null}
            {issue.comments.length === 0 ? (
              <EmptyPlaceholder title="No comments yet" />
            ) : (
              <div className="flex flex-col gap-2.5">
                {issue.comments.map((item, index) => (
                  <CommentCard
                    key={`${item.createdAt}-${index}`}
                    author={item.author}
                    avatarUrl={githubAvatarUrl(item.author)}
                    body={item.body}
                    createdAt={item.createdAt}
                    context="Conversation"
                  />
                ))}
              </div>
            )}
            <CommentComposer
              value={commentBody}
              onChange={setCommentBody}
              disabled={comment.isPending}
              ariaLabel="Issue comment"
              onSubmit={submitComment}
            />
          </section>
        </div>
      </div>
    </div>
  )
}
