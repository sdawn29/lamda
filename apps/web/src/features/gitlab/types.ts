export interface GlabStatus {
  installed: boolean
  authenticated: boolean
  login: string | null
}

export interface GitlabRepoInfo {
  nameWithOwner: string
  defaultBranch: string | null
  url: string
}

export interface GitlabRepositorySummary {
  nameWithOwner: string
  description: string | null
  isPrivate: boolean
  url: string
  cloneUrl: string
  updatedAt: string
}

export type GitlabRepositoryVisibility = "private" | "public"
export type MergeRequestState = "opened" | "closed" | "merged" | "all"
export type IssueState = "opened" | "closed" | "all"

export interface MergeRequestSummary {
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

export interface RepoContext {
  id?: string
  ws?: string
  path?: string
}

export interface PublishRepositoryInput extends RepoContext {
  name?: string
  visibility?: GitlabRepositoryVisibility
}

export interface CreateMergeRequestInput extends RepoContext {
  title: string
  description?: string
  sourceBranch?: string
  targetBranch?: string
  draft?: boolean
  removeSourceBranch?: boolean
}
