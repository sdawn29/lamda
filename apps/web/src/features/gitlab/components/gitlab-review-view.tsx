import { useState } from "react"
import { CircleDot, GitMerge, Loader2, UploadCloud } from "lucide-react"
import { toast } from "sonner"
import { useIsFetching, useQueryClient } from "@tanstack/react-query"

import { Badge } from "@/shared/ui/badge"
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
import { formatRelativeDate } from "@/shared/lib/formatters"
import { parseApiError } from "@/features/git"
import { CiChecksBadge } from "@/features/github/components/ci-checks-badge"
import {
  ListState,
  PanelMessage,
  RefreshButton,
  reviewItemStateIcon,
  Row,
} from "@/features/github/components/panel-primitives"
import {
  gitlabKeys,
  useGitlabIssues,
  useGitlabRepoInfo,
  useGitlabPipeline,
  useGlabStatus,
  useMergeRequests,
} from "../queries"
import { usePublishGitlabRepository } from "../mutations"
import type {
  GitlabRepositoryVisibility,
  MergeRequestState,
  RepoContext,
} from "../types"
import { CreateMrDialog } from "./create-mr-dialog"
import { GitlabMergeRequestDetail } from "./gitlab-merge-request-detail"
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
  const [selectedMr, setSelectedMr] = useState<number | null>(null)
  const qc = useQueryClient()
  const panelFetching = useIsFetching({ queryKey: gitlabKeys.all }) > 0
  const { data: pipeline } = useGitlabPipeline(
    ctx,
    branch ?? undefined,
    connected && Boolean(repo)
  )

  if (statusLoading) {
    return <PanelMessage loading message="Checking GitLab" />
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

  if (selectedMr != null) {
    return (
      <GitlabMergeRequestDetail
        ctx={ctx}
        number={selectedMr}
        onBack={() => setSelectedMr(null)}
      />
    )
  }

  return (
    <div className="@container/gitlab flex h-full min-h-0 flex-col bg-muted/[0.08]">
      <div className="shrink-0 p-2 pb-0">
        <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-background/90 p-2.5 shadow-sm shadow-black/[0.03] backdrop-blur @sm/gitlab:flex-row @sm/gitlab:items-center @sm/gitlab:justify-between dark:shadow-black/20">
          <button
            type="button"
            className="flex min-w-0 items-center gap-2 text-left text-xs font-medium hover:underline"
            onClick={() => void openExternal(repo.url)}
            title={repo.nameWithOwner}
          >
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/40">
              <GitlabLogo className="size-4" />
            </div>
            <span className="min-w-0">
              <span className="block truncate">{repo.nameWithOwner}</span>
              <span className="block text-3xs font-normal text-muted-foreground/60">
                GitLab repository
              </span>
            </span>
          </button>
          <div className="flex items-center justify-between gap-2 @sm/gitlab:justify-end">
            <CiChecksBadge
              checks={(pipeline?.jobs ?? []).map((job) => ({
                name: job.name,
                bucket: job.bucket,
                state: job.state,
                link: job.link,
                workflow: job.stage,
              }))}
            />
            <RefreshButton
              spinning={panelFetching}
              onClick={() => void qc.invalidateQueries({ queryKey: gitlabKeys.all })}
              label="Refresh GitLab data"
            />
            <Button
              size="sm"
              className="h-7 gap-1.5 px-2.5 text-xs"
              onClick={() => setCreateOpen(true)}
            >
              <GitMerge data-icon="inline-start" />
              Create MR
            </Button>
          </div>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-2 @sm/gitlab:p-3">
        <MergeRequestsSection ctx={ctx} onSelect={setSelectedMr} />
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

function emptyMrMessage(state: MergeRequestState): string {
  if (state === "closed") return "No closed merge requests"
  if (state === "all") return "No merge requests"
  return "No open merge requests"
}

function MergeRequestsSection({
  ctx,
  onSelect,
}: {
  ctx: RepoContext
  onSelect: (number: number) => void
}) {
  const [state, setState] = useState<MergeRequestState>("opened")
  const { data: mrs = [], isLoading } = useMergeRequests(ctx, state)
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
        <SectionLabel>Merge requests</SectionLabel>
        <ToggleGroup
          size="sm"
          variant="outline"
          value={[state]}
          onValueChange={(values) => {
            const next = values.find((value) => value !== state)
            if (next === "opened" || next === "closed" || next === "all") {
              setState(next)
            }
          }}
        >
          <ToggleGroupItem value="opened">Open</ToggleGroupItem>
          <ToggleGroupItem value="closed">Closed</ToggleGroupItem>
          <ToggleGroupItem value="all">All</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="divide-y divide-border/40 overflow-hidden rounded-xl border border-border/60 bg-card/65 shadow-sm shadow-black/[0.025] dark:shadow-black/20">
        <ListState
          loading={isLoading}
          empty={mrs.length === 0}
          message={emptyMrMessage(state)}
        />
        {mrs.map((mr) => (
          <Row
            key={mr.number}
            onClick={() => onSelect(mr.number)}
            external={false}
            icon={reviewItemStateIcon(mr.state, mr.isDraft, "opened")}
            title={mr.title}
            titleBadge={
              mr.isDraft ? (
                <Badge variant="outline" className="shrink-0">
                  Draft
                </Badge>
              ) : null
            }
            meta={`!${mr.number}${mr.author ? ` · ${mr.author}` : ""} · updated ${formatRelativeDate(mr.updatedAt)}`}
          />
        ))}
      </div>
    </section>
  )
}

function IssuesSection({ ctx }: { ctx: RepoContext }) {
  const { data: issues = [], isLoading } = useGitlabIssues(ctx, "opened")
  return (
    <section>
      <div className="mb-2 flex items-center px-0.5">
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
              onClick={() => void openExternal(issue.url)}
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
