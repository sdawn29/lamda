import { useState } from "react"
import {
  CircleDot,
  ExternalLink,
  GitMerge,
  Loader2,
  UploadCloud,
} from "lucide-react"
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
import { parseApiError } from "@/features/git"
import {
  useGitlabIssues,
  useGitlabRepoInfo,
  useGlabStatus,
  useMergeRequests,
} from "../queries"
import { usePublishGitlabRepository } from "../mutations"
import type { GitlabRepositoryVisibility, RepoContext } from "../types"
import { CreateMrDialog } from "./create-mr-dialog"
import { GitlabLogo } from "./gitlab-logo"

export function GitlabReviewView({
  sessionId,
  branch,
}: {
  sessionId: string
  branch: string | null
}) {
  const ctx: RepoContext = { id: sessionId }
  const { data: status, isLoading: statusLoading } = useGlabStatus(ctx)
  const connected = Boolean(status?.installed && status?.authenticated)
  const { data: repo, isLoading: repoLoading } = useGitlabRepoInfo(
    ctx,
    connected
  )
  const [createOpen, setCreateOpen] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)

  if (statusLoading) {
    return <PanelMessage loading message="Checking GitLab…" />
  }

  if (!connected) {
    return (
      <PanelMessage
        icon={<GitlabLogo className="size-5" />}
        message={
          status?.installed
            ? "Sign in to GitLab to manage merge requests and issues."
            : "Install the GitLab CLI (glab) to connect your account."
        }
        hint="Open Settings -> Git to connect."
      />
    )
  }

  if (repoLoading) {
    return <PanelMessage loading message="Loading repository…" />
  }

  if (!repo) {
    return (
      <>
        <PanelMessage
          icon={<GitlabLogo className="size-5" />}
          message="No GitLab repository found for this folder."
          hint="Publish this repository to GitLab to enable merge requests and issues."
        >
          <Button
            size="sm"
            className="h-7 gap-1.5 px-2.5 text-xs"
            onClick={() => setPublishOpen(true)}
          >
            <UploadCloud className="size-3.5" />
            Publish to GitLab
          </Button>
        </PanelMessage>
        <PublishGitlabRepositoryDialog
          open={publishOpen}
          onOpenChange={setPublishOpen}
          ctx={ctx}
        />
      </>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/50 px-3 py-2">
        <button
          type="button"
          className="flex min-w-0 items-center gap-1.5 text-xs font-medium hover:underline"
          onClick={() => void openExternal(repo.url)}
          title={repo.nameWithOwner}
        >
          <GitlabLogo className="size-3.5" />
          <span className="truncate">{repo.nameWithOwner}</span>
        </button>
        <Button
          size="sm"
          className="h-6 shrink-0 gap-1.5 px-2 text-xs"
          onClick={() => setCreateOpen(true)}
        >
          <GitMerge className="size-3.5" />
          Create MR
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <MergeRequestsSection ctx={ctx} />
        <IssuesSection ctx={ctx} />
      </div>

      <CreateMrDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        ctx={ctx}
        sourceBranch={branch}
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

function PublishGitlabRepositoryDialog({
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
    useState<GitlabRepositoryVisibility>("private")
  const publishRepository = usePublishGitlabRepository(ctx)

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
          <DialogTitle>Publish to GitLab</DialogTitle>
          <DialogDescription>
            Create a GitLab project for this folder, add a GitLab remote, and
            push the current branch.
          </DialogDescription>
        </DialogHeader>

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="gitlab-repo-name">Project name</FieldLabel>
            <Input
              id="gitlab-repo-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Defaults to folder name"
              disabled={publishRepository.isPending}
            />
            <FieldDescription>
              Use `group/name` to publish under a specific GitLab group.
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
                Publishing…
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
  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-2xs text-muted-foreground/60">
        <Loader2 className="size-3 animate-spin" />
        Loading…
      </div>
    )
  }
  if (empty) {
    return (
      <p className="px-3 py-2 text-2xs text-muted-foreground/50">{message}</p>
    )
  }
  return null
}

function MergeRequestsSection({ ctx }: { ctx: RepoContext }) {
  const { data: mrs = [], isLoading } = useMergeRequests(ctx, "opened")
  return (
    <section className="pb-1">
      <SectionHeader>Merge requests</SectionHeader>
      <ListState
        loading={isLoading}
        empty={mrs.length === 0}
        message="No open merge requests"
      />
      {mrs.map((mr) => (
        <Row
          key={mr.number}
          onClick={() => void openExternal(mr.url)}
          icon={
            <GitlabLogo
              className={
                mr.isDraft ? "size-3.5 text-muted-foreground" : "size-3.5"
              }
            />
          }
          title={`!${mr.number} ${mr.title}`}
          meta={`${mr.headRefName || "branch"} -> ${mr.baseRefName || "target"}`}
        />
      ))}
    </section>
  )
}

function IssuesSection({ ctx }: { ctx: RepoContext }) {
  const { data: issues = [], isLoading } = useGitlabIssues(ctx, "opened")
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
          icon={<CircleDot className="size-3.5" />}
          title={`#${issue.number} ${issue.title}`}
          meta={issue.labels.length ? issue.labels.join(", ") : issue.state}
        />
      ))}
    </section>
  )
}
