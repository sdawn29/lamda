import { useState } from "react"
import { ExternalLink, GitCommit, Loader2 } from "lucide-react"
import { useQuery } from "@tanstack/react-query"

import { openExternal } from "@/features/electron/api"
import { parseApiError } from "@/features/git"
import { DiffView } from "@/features/git/components/diff"
import { FileListItem } from "@/features/git/components/file-list-item"
import type { ChangedFile } from "@/features/git/components/status-badge"
import { formatRelativeDate } from "@/shared/lib/formatters"
import { cn } from "@/shared/lib/utils"
import { Button } from "@/shared/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip"

/** Provider-neutral commit shape; PR and MR commits both map onto this. */
export interface ReviewCommit {
  oid: string
  messageHeadline: string
  messageBody: string
  authoredDate: string
  committedDate: string
  authors: {
    login: string | null
    name: string | null
    email: string | null
  }[]
}

export interface CommitDiffFile {
  path: string
  previousPath: string | null
  status: string
  additions: number
  deletions: number
  patch: string | null
}

function commitFileToChangedFile(file: CommitDiffFile): ChangedFile {
  const status =
    file.status === "added"
      ? "A"
      : file.status === "removed"
        ? "D"
        : file.status === "renamed"
          ? "R"
          : "M"
  return {
    raw: status + " ",
    filePath: file.path,
    isStaged: false,
    isUntracked: false,
  }
}

/**
 * Commits tab for the PR/MR detail pages, styled to match the git review
 * panel's history timeline: expandable commit rows whose files open into
 * inline diffs loaded on demand from the provider.
 */
export function CommitList({
  commits,
  repositoryUrl,
  commitUrl,
  getCommitDiff,
}: {
  commits: ReviewCommit[]
  repositoryUrl: string
  commitUrl?: (oid: string) => string
  /** Loads a commit's changed files with patches; enables expandable diffs. */
  getCommitDiff?: (oid: string) => Promise<CommitDiffFile[]>
}) {
  if (commits.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          <GitCommit className="h-5 w-5 text-muted-foreground/40" />
        </div>
        <p className="text-xs font-medium text-muted-foreground/60">
          No commits found
        </p>
      </div>
    )
  }

  return (
    <div className="relative px-1 pt-2">
      {commits.map((commit) => (
        <CommitRow
          key={commit.oid}
          commit={commit}
          url={
            commitUrl?.(commit.oid) ?? `${repositoryUrl}/commit/${commit.oid}`
          }
          repositoryUrl={repositoryUrl}
          getCommitDiff={getCommitDiff}
        />
      ))}
    </div>
  )
}

function CommitRow({
  commit,
  url,
  repositoryUrl,
  getCommitDiff,
}: {
  commit: ReviewCommit
  url: string
  repositoryUrl: string
  getCommitDiff?: (oid: string) => Promise<CommitDiffFile[]>
}) {
  const [expanded, setExpanded] = useState(false)
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(
    () => new Set()
  )
  const author = commit.authors[0]
  const authorLabel =
    author?.login ?? author?.name ?? author?.email ?? "Unknown author"
  const expandable = getCommitDiff !== undefined
  const diff = useQuery({
    queryKey: ["commit-diff", repositoryUrl, commit.oid],
    queryFn: () => getCommitDiff!(commit.oid),
    enabled: expanded && expandable,
    // A commit's diff never changes; keep it for the session.
    staleTime: Infinity,
  })

  return (
    <div className="relative mb-0.5 flex items-start gap-0.5">
      {/* Commit icon */}
      <div className="mt-[5px] flex h-[18px] w-[18px] shrink-0 items-center justify-center">
        <GitCommit
          className={cn(
            "size-[15px] rotate-90 transition-colors duration-150",
            expanded ? "text-primary/70" : "text-muted-foreground/40"
          )}
        />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 pb-2">
        <div className="group/commit relative">
          <Tooltip delay={500}>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={() =>
                    expandable ? setExpanded((v) => !v) : void openExternal(url)
                  }
                  className="group w-full rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted/40 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <p className="truncate text-xs leading-snug font-medium text-foreground/85 group-hover:text-foreground">
                    {commit.messageHeadline || "(no message)"}
                  </p>
                  <div className="mt-0.5 flex items-center gap-1 text-2xs text-muted-foreground/45">
                    <span className="rounded bg-muted/60 px-1 font-mono text-muted-foreground/60">
                      {commit.oid.slice(0, 7)}
                    </span>
                    <span>·</span>
                    <span>{authorLabel}</span>
                    <span>·</span>
                    <span
                      title={new Date(commit.committedDate).toLocaleString()}
                    >
                      {formatRelativeDate(commit.committedDate)}
                    </span>
                  </div>
                </button>
              }
            />
            <TooltipContent side="left" className="max-w-sm items-start">
              <div className="min-w-0 space-y-1">
                <p className="font-medium break-words">
                  {commit.messageHeadline || "(no message)"}
                </p>
                {commit.messageBody && (
                  <p className="break-words whitespace-pre-wrap text-muted-foreground">
                    {commit.messageBody}
                  </p>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
          <Button
            variant="ghost"
            size="icon-xs"
            className="absolute top-1 right-1 opacity-0 transition-opacity group-hover/commit:opacity-100"
            aria-label="Open commit in browser"
            title="Open commit in browser"
            onClick={() => void openExternal(url)}
          >
            <ExternalLink className="size-3" aria-hidden />
          </Button>
        </div>

        {expanded && (
          <div className="mt-1.5 animate-in overflow-hidden rounded-md border border-border/40 duration-150 fade-in-0">
            {diff.isLoading ? (
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />
                Loading
              </div>
            ) : diff.error ? (
              <p className="px-3 py-2 text-2xs text-destructive">
                {parseApiError(diff.error)}
              </p>
            ) : (diff.data ?? []).length > 0 ? (
              <div className="divide-y divide-border/20">
                {(diff.data ?? []).map((file) => (
                  <FileListItem
                    key={file.path}
                    file={commitFileToChangedFile(file)}
                    sessionId=""
                    mode="inline"
                    showActions={false}
                    counts={{ added: file.additions, removed: file.deletions }}
                    expanded={expandedFiles.has(file.path)}
                    onExpandedChange={(fileExpanded) =>
                      setExpandedFiles((current) => {
                        const next = new Set(current)
                        if (fileExpanded) next.add(file.path)
                        else next.delete(file.path)
                        return next
                      })
                    }
                    expandedContent={
                      file.patch ? (
                        <DiffView diff={file.patch} filePath={file.path} />
                      ) : (
                        <p className="px-3 py-2 text-2xs text-muted-foreground">
                          No text diff available for this file.
                        </p>
                      )
                    }
                  />
                ))}
              </div>
            ) : (
              <p className="px-3 py-2 text-2xs text-muted-foreground/50">
                No files changed
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
