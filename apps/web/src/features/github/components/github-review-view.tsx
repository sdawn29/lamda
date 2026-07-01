import { useState } from "react"
import {
  CircleDot,
  ExternalLink,
  GitPullRequest,
  GitPullRequestArrow,
  Loader2,
  UploadCloud,
} from "lucide-react"
import { Github } from "@lobehub/icons"
import { toast } from "sonner"
import { Button } from "@/shared/ui/button"
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
  usePullRequests,
  useRepoInfo,
} from "../queries"
import { usePublishRepository } from "../mutations"
import { CiChecksBadge } from "./ci-checks-badge"
import { CreatePrDialog } from "./create-pr-dialog"
import type { GhRepositoryVisibility, RepoContext } from "../types"

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
        <PullRequestsSection ctx={ctx} />
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
}: {
  onClick: () => void
  icon: React.ReactNode
  title: string
  meta: string
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
      <ExternalLink className="mt-0.5 size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
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

function PullRequestsSection({ ctx }: { ctx: RepoContext }) {
  const { data: prs = [], isLoading } = usePullRequests(ctx, "open")
  return (
    <section className="pb-1">
      <SectionHeader>Pull requests</SectionHeader>
      <ListState
        loading={isLoading}
        empty={prs.length === 0}
        message="No open pull requests"
      />
      {prs.map((pr) => (
        <Row
          key={pr.number}
          onClick={() => void openExternal(pr.url)}
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
