import { useState } from "react"
import {
  ArrowLeft,
  CircleDot,
  ExternalLink,
  GitBranch,
  GitCommitHorizontal,
  GitMerge,
  GitPullRequest,
  GitPullRequestArrow,
  Loader2,
  MessageSquare,
  UploadCloud,
} from "lucide-react"
import { Github } from "@lobehub/icons"
import { toast } from "sonner"
import { useIsFetching, useQueryClient } from "@tanstack/react-query"
import { Button } from "@/shared/ui/button"
import { RemoteMarkdown } from "@/shared/components/remote-markdown"
import { Badge } from "@/shared/ui/badge"
import { Textarea } from "@/shared/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs"
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
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/shared/ui/field"
import { Input } from "@/shared/ui/input"
import { SectionLabel } from "@/shared/ui/section-label"
import { ToggleGroup, ToggleGroupItem } from "@/shared/ui/toggle-group"
import { openExternal } from "@/features/electron/api"
import { formatRelativeDate } from "@/shared/lib/formatters"
import { parseApiError } from "@/features/git"
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
import { CiChecksBadge } from "./ci-checks-badge"
import { CreatePrDialog } from "./create-pr-dialog"
import { PullRequestFiles } from "./pull-request-files"
import { PullRequestCommentCard } from "./pull-request-comment-card"
import {
  humanizeStatus,
  ListState,
  PanelMessage,
  RefreshButton,
  reviewItemStateIcon,
  Row,
  StatusBadge,
} from "./panel-primitives"
import type {
  GhRepositoryVisibility,
  MergeMethod,
  PrState,
  PullRequestCommit,
  PullRequestReviewComment,
  RepoContext,
} from "../types"

/**
 * GitHub view for the review panel — repo overview, current-branch CI status,
 * and open pull requests + issues, with a Create PR action. Scoped to the
 * thread's session (its worktree).
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
        <PublishRepositoryDialog
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
    <div className="@container/github flex h-full min-h-0 flex-col bg-muted/[0.08]">
      <div className="shrink-0 p-2 pb-0">
        <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-background/90 p-2.5 shadow-sm shadow-black/[0.03] backdrop-blur @sm/github:flex-row @sm/github:items-center @sm/github:justify-between dark:shadow-black/20">
          <button
            type="button"
            className="flex min-w-0 items-center gap-2 text-left text-xs font-medium hover:underline"
            onClick={() => void openExternal(repo.url)}
            title={repo.nameWithOwner}
          >
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/40">
              <Github size={15} />
            </div>
            <span className="min-w-0">
              <span className="block truncate">{repo.nameWithOwner}</span>
              <span className="block text-3xs font-normal text-muted-foreground/60">
                GitHub repository
              </span>
            </span>
          </button>
          <div className="flex items-center justify-between gap-2 @sm/github:justify-end">
            <CiChecksBadge checks={checks} />
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
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-2 @sm/github:p-3">
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

function PublishRepositoryDialog({
  open,
  onOpenChange,
  ctx,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  ctx: RepoContext
}) {
  const [name, setName] = useState("")
  const [visibility, setVisibility] =
    useState<GhRepositoryVisibility>("private")
  const publishRepository = usePublishRepository(ctx)

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && !publishRepository.isPending) {
      setName("")
      setVisibility("private")
    }
    onOpenChange(nextOpen)
  }

  function handlePublish() {
    publishRepository.mutate(
      { name: name.trim() || undefined, visibility },
      {
        onSuccess: (repo) => {
          toast.success(`Published ${repo.nameWithOwner}`)
          handleOpenChange(false)
        },
        onError: (error) => {
          toast.error("Couldn't publish repository", {
            description: parseApiError(error),
          })
        },
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={!publishRepository.isPending}>
        <DialogHeader>
          <DialogTitle>Publish to GitHub</DialogTitle>
          <DialogDescription>
            Create a GitHub repository for this folder, add a GitHub remote, and
            push the current branch.
          </DialogDescription>
        </DialogHeader>

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="github-repo-name">Repository name</FieldLabel>
            <Input
              id="github-repo-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Defaults to folder name"
              disabled={publishRepository.isPending}
            />
            <FieldDescription>
              Use `owner/name` to publish under a specific organization.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel>Visibility</FieldLabel>
            <ToggleGroup
              variant="outline"
              size="sm"
              value={[visibility]}
              onValueChange={(values) => {
                const next = values.find((value) => value !== visibility)
                if (next === "private" || next === "public") {
                  setVisibility(next)
                }
              }}
            >
              <ToggleGroupItem value="private">Private</ToggleGroupItem>
              <ToggleGroupItem value="public">Public</ToggleGroupItem>
            </ToggleGroup>
          </Field>
        </FieldGroup>

        <DialogFooter>
          <DialogClose
            render={<Button variant="outline" />}
            disabled={publishRepository.isPending}
          >
            Cancel
          </DialogClose>
          <Button
            onClick={handlePublish}
            disabled={publishRepository.isPending}
          >
            {publishRepository.isPending ? (
              <>
                <Loader2 className="size-3 animate-spin" />
                Publishing
              </>
            ) : (
              <>
                <UploadCloud className="size-3" />
                Publish
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
      <div className="divide-y divide-border/40 overflow-hidden rounded-xl border border-border/60 bg-card/65 shadow-sm shadow-black/[0.025] dark:shadow-black/20">
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
      </div>
    </section>
  )
}

interface PullRequestActivityItem {
  key: string
  author: string | null
  body: string
  createdAt: string
  context: string
  reviewComment: boolean
  reviewCommentId?: number
  diff?: {
    patch: string
    line: number | null
    side: "LEFT" | "RIGHT" | null
  }
}

function reviewCommentContext(comment: PullRequestReviewComment): string {
  const line = comment.line ?? comment.originalLine
  const side = comment.side === "LEFT" ? "Old" : "New"
  return line ? `${comment.path} · ${side} line ${line}` : comment.path
}

function PullRequestActivityList({
  items,
  reviewLoading,
  reviewError,
  onReply,
}: {
  items: PullRequestActivityItem[]
  reviewLoading: boolean
  reviewError: unknown
  onReply: (item: PullRequestActivityItem, body: string) => Promise<unknown>
}) {
  if (reviewLoading && items.length === 0) {
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
      {reviewError ? (
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

export function PullRequestCommits({
  commits,
  repositoryUrl,
  commitUrl,
}: {
  commits: PullRequestCommit[]
  repositoryUrl: string
  commitUrl?: (oid: string) => string
}) {
  if (commits.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/70 bg-card/45 px-4 py-8 text-center">
        <GitCommitHorizontal className="mx-auto mb-2 size-5 text-muted-foreground/40" />
        <p className="text-xs font-medium">No commits found</p>
      </div>
    )
  }

  return (
    <section className="overflow-hidden rounded-xl border border-border/60 bg-card/70 shadow-sm shadow-black/[0.025]">
      <div className="flex items-center gap-2 border-b border-border/45 px-3 py-2.5">
        <SectionLabel>Commits</SectionLabel>
        <Badge variant="secondary">{commits.length}</Badge>
      </div>
      <div className="divide-y divide-border/40">
        {commits.map((commit) => {
          const author = commit.authors[0]
          return (
            <button
              key={commit.oid}
              type="button"
              className="group flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-muted/30"
              onClick={() =>
                void openExternal(
                  commitUrl?.(commit.oid) ??
                    `${repositoryUrl}/commit/${commit.oid}`
                )
              }
            >
              <GitCommitHorizontal className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/60" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">
                  {commit.messageHeadline}
                </span>
                <span
                  className="mt-0.5 block truncate text-3xs text-muted-foreground/60"
                  title={new Date(commit.committedDate).toLocaleString()}
                >
                  {author?.login ??
                    author?.name ??
                    author?.email ??
                    "Unknown author"}{" "}
                  · {formatRelativeDate(commit.committedDate)}
                </span>
              </span>
              <code className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-3xs text-muted-foreground">
                {commit.oid.slice(0, 7)}
              </code>
            </button>
          )
        })}
      </div>
    </section>
  )
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

  if (isLoading) return <PanelMessage loading message="Loading pull request" />
  if (error || !pr) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
        <p className="text-xs text-muted-foreground">
          {error ? parseApiError(error) : "Pull request not found"}
        </p>
        <Button size="sm" variant="outline" onClick={onBack}>
          Back to pull requests
        </Button>
      </div>
    )
  }

  const isOpen = pr.state.toLowerCase() === "open"
  const pending = comment.isPending || checkout.isPending || merge.isPending
  const reviewFilesByPath = new Map(
    (review?.files ?? []).map((file) => [file.path, file] as const)
  )
  const activity: PullRequestActivityItem[] = [
    ...pr.comments.map((item, index) => ({
      key: `conversation-${item.createdAt}-${index}`,
      author: item.author,
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
      <div className="shrink-0 p-2 pb-0">
        <div className="flex min-h-11 items-center gap-2 rounded-xl border border-border/60 bg-background/85 px-2 py-1.5 shadow-sm shadow-black/[0.03] backdrop-blur dark:shadow-black/20">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onBack}
            aria-label="Back to pull requests"
          >
            <ArrowLeft data-icon="inline-start" />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-foreground/90">
              {pr.title}
            </p>
            <p className="truncate text-3xs text-muted-foreground/60">
              Pull request #{pr.number} · {pr.author ?? "Unknown author"}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void openExternal(pr.url)}
            aria-label="Open on GitHub"
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
            title={`${pr.changedFiles} changed files`}
            className="h-6 flex-none rounded-full px-2.5 has-data-[icon=inline-start]:pl-2 data-active:bg-primary data-active:text-primary-foreground data-active:shadow-sm"
          >
            <GitPullRequest data-icon="inline-start" />
            Files
            <span className="rounded-full bg-foreground/5 px-1.5 text-3xs text-current tabular-nums">
              {pr.changedFiles}
            </span>
          </TabsTrigger>
          <TabsTrigger
            value="commits"
            className="h-6 flex-none rounded-full px-2.5 has-data-[icon=inline-start]:pl-2 data-active:bg-primary data-active:text-primary-foreground data-active:shadow-sm"
          >
            <GitCommitHorizontal data-icon="inline-start" />
            Commits
            <span className="rounded-full bg-foreground/5 px-1.5 text-3xs text-current tabular-nums">
              {pr.commits.length}
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="overview"
          className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 @sm/pr:px-3"
        >
          <div className="flex flex-col gap-2.5">
            <section className="rounded-xl border border-border/60 bg-card/70 p-3 shadow-sm shadow-black/[0.025] dark:shadow-black/20">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant={isOpen ? "default" : "secondary"}>
                  {humanizeStatus(pr.state).label}
                </Badge>
                {pr.isDraft ? <Badge variant="outline">Draft</Badge> : null}
                <StatusBadge value={pr.reviewDecision} />
                <StatusBadge value={pr.mergeable} />
              </div>

              <div className="mt-3 flex min-w-0 items-center gap-2 rounded-lg border border-border/45 bg-background/65 px-2.5 py-2 text-xs text-muted-foreground">
                <GitBranch className="size-3.5 shrink-0" aria-hidden />
                <span className="min-w-0 truncate font-mono">
                  {pr.headRefName}
                </span>
                <span className="shrink-0 text-muted-foreground/40">→</span>
                <span className="min-w-0 truncate font-mono">
                  {pr.baseRefName}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-4 divide-x divide-border/50 rounded-lg bg-muted/35 py-2 text-center">
                <div>
                  <p className="text-xs font-semibold tabular-nums">
                    {pr.changedFiles}
                  </p>
                  <p className="text-3xs text-muted-foreground">Files</p>
                </div>
                <div>
                  <p className="text-xs font-semibold tabular-nums">
                    {pr.commits.length}
                  </p>
                  <p className="text-3xs text-muted-foreground">Commits</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-diff-add tabular-nums">
                    +{pr.additions}
                  </p>
                  <p className="text-3xs text-muted-foreground">Added</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-diff-remove tabular-nums">
                    -{pr.deletions}
                  </p>
                  <p className="text-3xs text-muted-foreground">Removed</p>
                </div>
              </div>
            </section>

            {pr.body ? (
              <section className="rounded-xl border border-border/60 bg-card/70 p-3 shadow-sm shadow-black/[0.025] dark:shadow-black/20">
                <SectionLabel>Description</SectionLabel>
                <div className="mt-2">
                  <RemoteMarkdown content={pr.body} />
                </div>
              </section>
            ) : null}

            {pr.checks.length > 0 ? (
              <section className="overflow-hidden rounded-xl border border-border/60 bg-card/70 shadow-sm shadow-black/[0.025] dark:shadow-black/20">
                <div className="border-b border-border/45 px-3 py-2.5">
                  <SectionLabel>Checks</SectionLabel>
                </div>
                <div className="divide-y divide-border/40">
                  {pr.checks.map((check) => (
                    <button
                      key={`${check.workflow}-${check.name}`}
                      type="button"
                      disabled={!check.link}
                      onClick={() =>
                        check.link && void openExternal(check.link)
                      }
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-muted/30 disabled:cursor-default"
                    >
                      <span className="min-w-0 truncate">
                        {check.workflow ? `${check.workflow} / ` : ""}
                        {check.name}
                      </span>
                      <Badge
                        variant={
                          check.bucket === "pass"
                            ? "secondary"
                            : check.bucket === "fail"
                              ? "destructive"
                              : "outline"
                        }
                      >
                        {check.state}
                      </Badge>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="flex flex-col gap-2">
              <div className="flex items-center gap-2 px-0.5">
                <SectionLabel>Comments</SectionLabel>
                {commentCount > 0 ? (
                  <Badge variant="secondary">{commentCount}</Badge>
                ) : null}
              </div>
              <PullRequestActivityList
                items={activity}
                reviewLoading={reviewLoading}
                reviewError={reviewError}
                onReply={replyToActivity}
              />
              <div className="rounded-xl border border-border/60 bg-card/75 p-2.5 shadow-sm shadow-black/[0.025]">
                <Textarea
                  value={commentBody}
                  onChange={(event) => setCommentBody(event.target.value)}
                  placeholder="Add to the conversation…"
                  disabled={pending}
                  aria-label="Pull request comment"
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
          <PullRequestCommits
            commits={pr.commits}
            repositoryUrl={repositoryUrl}
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
                onSuccess: () => toast.success("Pull request checked out"),
                onError: (checkoutError) =>
                  toast.error("Couldn't check out pull request", {
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
            <AlertDialogTitle>Merge pull request #{number}?</AlertDialogTitle>
            <AlertDialogDescription>
              This action updates the remote repository and cannot be undone
              from this panel.
            </AlertDialogDescription>
          </AlertDialogHeader>
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
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={merge.isPending}
              onClick={() =>
                merge.mutate(
                  { number, method: mergeMethod },
                  {
                    onSuccess: () => {
                      setMergeOpen(false)
                      toast.success("Pull request merged")
                    },
                    onError: (mergeError) =>
                      toast.error("Couldn't merge pull request", {
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
      <div className="divide-y divide-border/40 overflow-hidden rounded-xl border border-border/60 bg-card/65 shadow-sm shadow-black/[0.025] dark:shadow-black/20">
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
      </div>
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

  if (isLoading) return <PanelMessage loading message="Loading issue" />
  if (error || !issue) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
        <p className="text-xs text-muted-foreground">
          {error ? parseApiError(error) : "Issue not found"}
        </p>
        <Button size="sm" variant="outline" onClick={onBack}>
          Back to issues
        </Button>
      </div>
    )
  }

  const isOpen = issue.state.toLowerCase() === "open"

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
      <div className="shrink-0 p-2 pb-0">
        <div className="flex min-h-11 items-center gap-2 rounded-xl border border-border/60 bg-background/85 px-2 py-1.5 shadow-sm shadow-black/[0.03] backdrop-blur dark:shadow-black/20">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onBack}
            aria-label="Back to issues"
          >
            <ArrowLeft data-icon="inline-start" />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-foreground/90">
              {issue.title}
            </p>
            <p className="truncate text-3xs text-muted-foreground/60">
              Issue #{issue.number} · {issue.author ?? "Unknown author"}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void openExternal(issue.url)}
            aria-label="Open on GitHub"
          >
            <ExternalLink data-icon="inline-start" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 @sm/pr:px-3">
        <div className="flex flex-col gap-2.5 pt-2.5">
          <section className="rounded-xl border border-border/60 bg-card/70 p-3 shadow-sm shadow-black/[0.025] dark:shadow-black/20">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant={isOpen ? "default" : "secondary"}>
                {humanizeStatus(issue.state).label}
              </Badge>
              {issue.labels.map((label) => (
                <Badge key={label} variant="outline">
                  {label}
                </Badge>
              ))}
            </div>
          </section>

          {issue.body ? (
            <section className="rounded-xl border border-border/60 bg-card/70 p-3 shadow-sm shadow-black/[0.025] dark:shadow-black/20">
              <SectionLabel>Description</SectionLabel>
              <div className="mt-2">
                <RemoteMarkdown content={issue.body} />
              </div>
            </section>
          ) : null}

          <section className="flex flex-col gap-2">
            <div className="flex items-center gap-2 px-0.5">
              <SectionLabel>Comments</SectionLabel>
              {issue.comments.length > 0 ? (
                <Badge variant="secondary">{issue.comments.length}</Badge>
              ) : null}
            </div>
            {issue.comments.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/70 bg-card/45 px-4 py-8 text-center">
                <MessageSquare className="mx-auto mb-2 size-5 text-muted-foreground/40" />
                <p className="text-xs font-medium">No comments yet</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {issue.comments.map((item, index) => (
                  <PullRequestCommentCard
                    key={`${item.createdAt}-${index}`}
                    author={item.author}
                    body={item.body}
                    createdAt={item.createdAt}
                    context="Conversation"
                  />
                ))}
              </div>
            )}
            <div className="rounded-xl border border-border/60 bg-card/75 p-2.5 shadow-sm shadow-black/[0.025]">
              <Textarea
                value={commentBody}
                onChange={(event) => setCommentBody(event.target.value)}
                placeholder="Add to the conversation…"
                disabled={comment.isPending}
                aria-label="Issue comment"
                className="min-h-24 resize-y border-border/50 bg-background/70"
              />
              <div className="mt-2 flex justify-end">
                <Button
                  size="sm"
                  onClick={submitComment}
                  disabled={!commentBody.trim() || comment.isPending}
                >
                  <MessageSquare data-icon="inline-start" />
                  Comment
                </Button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
