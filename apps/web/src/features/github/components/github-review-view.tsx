import { useState } from "react"
import {
  ArrowLeft,
  ChevronRight,
  CircleDot,
  ExternalLink,
  GitBranch,
  GitMerge,
  GitPullRequest,
  GitPullRequestArrow,
  Loader2,
  MessageSquare,
  UploadCloud,
} from "lucide-react"
import { Github } from "@lobehub/icons"
import { toast } from "sonner"
import { Button } from "@/shared/ui/button"
import { RemoteMarkdown } from "@/shared/components/remote-markdown"
import { Badge } from "@/shared/ui/badge"
import { Textarea } from "@/shared/ui/textarea"
import { Separator } from "@/shared/ui/separator"
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
import { cn } from "@/shared/lib/utils"
import { parseApiError } from "@/features/git"
import {
  useChecks,
  useGhStatus,
  useIssues,
  usePullRequest,
  usePullRequests,
  useRepoInfo,
} from "../queries"
import {
  useCheckoutPullRequest,
  useCommentPullRequest,
  useMergePullRequest,
  usePublishRepository,
} from "../mutations"
import { CiChecksBadge } from "./ci-checks-badge"
import { CreatePrDialog } from "./create-pr-dialog"
import type { GhRepositoryVisibility, MergeMethod, RepoContext } from "../types"

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
        hint="Open Settings → GitHub to connect."
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Repo header */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/50 px-3 py-2">
        <button
          type="button"
          className="flex min-w-0 items-center gap-1.5 text-xs font-medium hover:underline"
          onClick={() => void openExternal(repo.url)}
          title={repo.nameWithOwner}
        >
          <Github size={13} />
          <span className="truncate">{repo.nameWithOwner}</span>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          <CiChecksBadge checks={checks} />
          <Button
            size="sm"
            className="h-6 gap-1.5 px-2 text-xs"
            onClick={() => setCreateOpen(true)}
          >
            <GitPullRequestArrow className="size-3.5" />
            Create PR
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <PullRequestsSection ctx={ctx} onSelect={setSelectedPr} />
        <IssuesSection ctx={ctx} />
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

function PanelMessage({
  loading,
  icon,
  message,
  hint,
  children,
}: {
  loading?: boolean
  icon?: React.ReactNode
  message: string
  hint?: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-4 py-12 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground/50">
        {loading ? <Loader2 className="size-5 animate-spin" /> : icon}
      </div>
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground/70">
          {message}
        </p>
        {hint && (
          <p className="text-3xs leading-relaxed text-muted-foreground/40">
            {hint}
          </p>
        )}
      </div>
      {children && <div className="pt-1">{children}</div>}
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

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-1.5 bg-background/95 px-3 pt-3 pb-1.5 backdrop-blur">
      <SectionLabel>{children}</SectionLabel>
    </div>
  )
}

function Row({
  onClick,
  icon,
  title,
  meta,
  external = true,
}: {
  onClick: () => void
  icon: React.ReactNode
  title: string
  meta: string
  external?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-start gap-2 px-3 py-1.5 text-left hover:bg-accent"
    >
      <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium">{title}</span>
        <span className="block truncate text-3xs text-muted-foreground">
          {meta}
        </span>
      </span>
      {external ? (
        <ExternalLink className="mt-0.5 size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      ) : (
        <ChevronRight className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
      )}
    </button>
  )
}

function ListState({
  loading,
  empty,
  message,
}: {
  loading: boolean
  empty: boolean
  message: string
}) {
  if (loading)
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-2xs text-muted-foreground/60">
        <Loader2 className="size-3 animate-spin" />
        Loading
      </div>
    )
  if (empty)
    return (
      <p className="px-3 py-2 text-2xs text-muted-foreground/50">{message}</p>
    )
  return null
}

function PullRequestsSection({
  ctx,
  onSelect,
}: {
  ctx: RepoContext
  onSelect: (number: number) => void
}) {
  const [state, setState] = useState<"open" | "closed" | "all">("open")
  const { data: prs = [], isLoading } = usePullRequests(ctx, state)
  return (
    <section className="pb-1">
      <div className="flex items-center justify-between gap-2 px-3 pt-3 pb-1.5">
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
      <ListState
        loading={isLoading}
        empty={prs.length === 0}
        message="No open pull requests"
      />
      {prs.map((pr) => (
        <Row
          key={pr.number}
          onClick={() => onSelect(pr.number)}
          external={false}
          icon={
            <GitPullRequest
              className={cn(
                "size-3.5",
                pr.isDraft ? "text-muted-foreground" : "text-emerald-600"
              )}
            />
          }
          title={pr.title}
          meta={`#${pr.number} · ${pr.headRefName}${
            pr.author ? ` · ${pr.author}` : ""
          }`}
        />
      ))}
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
  const comment = useCommentPullRequest(ctx)
  const checkout = useCheckoutPullRequest(ctx)
  const merge = useMergePullRequest(ctx)
  const [commentBody, setCommentBody] = useState("")
  const [mergeOpen, setMergeOpen] = useState(false)
  const [mergeMethod, setMergeMethod] = useState<MergeMethod>("squash")

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
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border/50 px-2">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onBack}
          aria-label="Back to pull requests"
        >
          <ArrowLeft data-icon="inline-start" />
        </Button>
        <span className="min-w-0 flex-1 truncate text-xs font-medium">
          #{pr.number} {pr.title}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => void openExternal(pr.url)}
          aria-label="Open on GitHub"
        >
          <ExternalLink data-icon="inline-start" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={isOpen ? "default" : "secondary"}>{pr.state}</Badge>
            {pr.isDraft ? <Badge variant="outline">Draft</Badge> : null}
            {pr.reviewDecision ? (
              <Badge variant="outline">{pr.reviewDecision}</Badge>
            ) : null}
            {pr.mergeable ? (
              <Badge variant="outline">{pr.mergeable}</Badge>
            ) : null}
          </div>

          <div className="flex flex-col gap-1 text-xs">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <GitBranch className="size-3.5" aria-hidden />
              <span className="font-mono">{pr.headRefName}</span>
              <span>→</span>
              <span className="font-mono">{pr.baseRefName}</span>
            </div>
            <p className="text-muted-foreground">
              {pr.author ?? "Unknown author"} · {pr.changedFiles} changed files
              · <span className="text-diff-add">+{pr.additions}</span>{" "}
              <span className="text-diff-remove">-{pr.deletions}</span>
            </p>
          </div>

          {pr.body ? <RemoteMarkdown content={pr.body} /> : null}

          {pr.checks.length > 0 ? (
            <section className="flex flex-col gap-2">
              <SectionLabel>Checks</SectionLabel>
              {pr.checks.map((check) => (
                <button
                  key={`${check.workflow}-${check.name}`}
                  type="button"
                  disabled={!check.link}
                  onClick={() => check.link && void openExternal(check.link)}
                  className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2 py-1.5 text-left text-xs disabled:cursor-default"
                >
                  <span className="truncate">
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
            </section>
          ) : null}

          {pr.files.length > 0 ? (
            <section className="flex flex-col gap-2">
              <SectionLabel>Files</SectionLabel>
              <div className="flex flex-col rounded-md border border-border/60">
                {pr.files.map((file) => (
                  <div
                    key={file.path}
                    className="flex items-center justify-between gap-2 px-2 py-1.5 text-xs"
                  >
                    <span className="min-w-0 truncate font-mono">
                      {file.path}
                    </span>
                    <span className="shrink-0 font-mono">
                      <span className="text-diff-add">+{file.additions}</span>{" "}
                      <span className="text-diff-remove">
                        -{file.deletions}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <Separator />
          <section className="flex flex-col gap-2">
            <SectionLabel>Conversation ({pr.comments.length})</SectionLabel>
            {pr.comments.map((item, index) => (
              <div
                key={`${item.createdAt}-${index}`}
                className="rounded-md border border-border/60 p-2"
              >
                <p className="mb-1 text-3xs font-medium text-muted-foreground">
                  {item.author ?? "Unknown"} ·{" "}
                  {new Date(item.createdAt).toLocaleString()}
                </p>
                <RemoteMarkdown content={item.body} />
              </div>
            ))}
            <Textarea
              value={commentBody}
              onChange={(event) => setCommentBody(event.target.value)}
              placeholder="Add a comment…"
              disabled={pending}
              aria-label="Pull request comment"
            />
            <Button
              size="sm"
              onClick={submitComment}
              disabled={!commentBody.trim() || pending}
            >
              <MessageSquare data-icon="inline-start" />
              Comment
            </Button>
          </section>
        </div>
      </div>

      {isOpen ? (
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border/50 p-2">
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

function IssuesSection({ ctx }: { ctx: RepoContext }) {
  const { data: issues = [], isLoading } = useIssues(ctx, "open")
  return (
    <section className="pb-2">
      <SectionHeader>Issues</SectionHeader>
      <ListState
        loading={isLoading}
        empty={issues.length === 0}
        message="No open issues"
      />
      {issues.map((issue) => (
        <Row
          key={issue.number}
          onClick={() => void openExternal(issue.url)}
          icon={<CircleDot className="size-3.5 text-emerald-600" />}
          title={issue.title}
          meta={`#${issue.number}${issue.author ? ` · ${issue.author}` : ""}${
            issue.labels.length ? ` · ${issue.labels.join(", ")}` : ""
          }`}
        />
      ))}
    </section>
  )
}
