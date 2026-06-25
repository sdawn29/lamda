export interface GhStatus {
  installed: boolean
  authenticated: boolean
  login: string | null
}

export interface GhRepoInfo {
  nameWithOwner: string
  defaultBranch: string | null
  url: string
}

export interface GhRepositorySummary {
  nameWithOwner: string
  description: string | null
  isPrivate: boolean
  url: string
  updatedAt: string
}

export type GhRepositoryVisibility = "private" | "public"

export type PrState = "open" | "closed" | "merged" | "all"
export type IssueState = "open" | "closed" | "all"
export type MergeMethod = "merge" | "squash" | "rebase"

export interface PullRequestSummary {
  number: number
  title: string
  state: string
  isDraft: boolean
  author: string | null
  headRefName: string
  baseRefName: string
  url: string
  updatedAt: string
  createdAt: string
}

export interface CheckRun {
  name: string
  bucket: string
  state: string
  link: string | null
  workflow: string | null
}

export interface PullRequestDetail extends PullRequestSummary {
  body: string
  additions: number
  deletions: number
  changedFiles: number
  reviewDecision: string | null
  mergeable: string | null
  files: { path: string; additions: number; deletions: number }[]
  comments: { author: string | null; body: string; createdAt: string }[]
  checks: CheckRun[]
}

export interface IssueSummary {
  number: number
  title: string
  state: string
  author: string | null
  labels: string[]
  url: string
  updatedAt: string
  createdAt: string
}

export interface IssueDetail extends IssueSummary {
  body: string
  comments: { author: string | null; body: string; createdAt: string }[]
}

/**
 * Identifies the repo a request targets. Exactly one of these is sent; the
 * server resolves it to a working directory. `id` is a live session id
 * (preferred — resolves to the thread's worktree), `ws` a workspace id.
 */
export interface RepoContext {
  id?: string
  ws?: string
  path?: string
}

export interface CreatePrInput extends RepoContext {
  title: string
  body?: string
  base?: string
  head?: string
  draft?: boolean
  /** Push the current branch (with upstream) before opening the PR. Default true. */
  push?: boolean
}

export interface PublishRepositoryInput extends RepoContext {
  name?: string
  visibility?: GhRepositoryVisibility
}
