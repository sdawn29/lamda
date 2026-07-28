import { useState } from "react"
import { CircleDot, GitMerge, UploadCloud } from "lucide-react"
import { toast } from "sonner"
import { useIsFetching, useQueryClient } from "@tanstack/react-query"

import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import { SectionLabel } from "@/shared/ui/section-label"
import { ToggleGroup, ToggleGroupItem } from "@/shared/ui/toggle-group"
import { openExternal } from "@/features/electron/api"
import { useQueryFreshness } from "@/shared/hooks/use-query-freshness"
import { formatRelativeDate } from "@/shared/lib/formatters"
import { parseApiError } from "@/features/git"
import {
  CiChecksBadge,
  LastUpdatedLabel,
  ListCard,
  ListState,
  PanelMessage,
  PublishRepositoryDialog,
  RefreshButton,
  RepoPanelHeader,
  reviewItemStateIcon,
  Row,
} from "@/features/review"
import {
  gitlabKeys,
  useGitlabIssues,
  useGitlabRepoInfo,
  useGitlabPipeline,
  useGlabStatus,
  useMergeRequests,
} from "../queries"
import { usePublishGitlabRepository } from "../mutations"
import type { MergeRequestState, RepoContext } from "../types"
import { CreateMrDialog } from "./create-mr-dialog"
import { GitlabMergeRequestDetail } from "./gitlab-merge-request-detail"
import { GitlabLogo } from "./gitlab-logo"

/**
 * GitLab view for the review panel; mirrors the GitHub view. All shared
 * visuals come from `@/features/review`.
 */
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
  const lastUpdated = useQueryFreshness(gitlabKeys.all)
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
        <GitlabPublishDialog
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
    <div className="@container/panel flex h-full min-h-0 flex-col bg-muted/[0.08]">
      <RepoPanelHeader
        icon={<GitlabLogo className="size-4" />}
        name={repo.nameWithOwner}
        subtitle="GitLab repository"
        url={repo.url}
      >
        <CiChecksBadge
          checks={(pipeline?.jobs ?? []).map((job) => ({
            name: job.name,
            bucket: job.bucket,
            state: job.state,
            link: job.link,
            workflow: job.stage,
          }))}
        />
        <LastUpdatedLabel updatedAt={lastUpdated} />
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
      </RepoPanelHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-2 @sm/panel:p-3">
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

function GitlabPublishDialog({
  open,
  onOpenChange,
  ctx,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  ctx: RepoContext
}) {
  const publishRepository = usePublishGitlabRepository(ctx)

  return (
    <PublishRepositoryDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Publish to GitLab"
      description="Create a GitLab project for this folder, add a GitLab remote, and push the current branch."
      nameLabel="Project name"
      namePlaceholder="Defaults to folder name"
      nameDescription="Use `group/name` to publish under a specific GitLab group."
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
      <ListCard>
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
      </ListCard>
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
      </ListCard>
    </section>
  )
}
