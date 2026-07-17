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

export interface PipelineJob {
  name: string
  stage: string | null
  bucket: string
  state: string
  link: string | null
  allowFailure: boolean
}

export interface PipelineDetail {
  id: number
  status: string
  ref: string | null
  url: string | null
  jobs: PipelineJob[]
}

export interface MergeRequestDetail extends MergeRequestSummary {
  description: string
  authorAvatarUrl: string | null
  reviewers: { login: string; name: string | null; avatarUrl: string | null }[]
  autoMergeEnabled: boolean
  mergeStatus: string | null
  changesCount: string | null
  additions: number
  deletions: number
  changedFiles: number
  files: { path: string; additions: number; deletions: number }[]
  commits: MergeRequestCommit[]
  comments: {
    id: number
    author: string | null
    authorAvatarUrl: string | null
    body: string
    createdAt: string
  }[]
  pipeline: PipelineDetail | null
}

export interface MergeRequestCommit {
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

export type ReviewSide = "LEFT" | "RIGHT"

export interface MergeRequestReviewFile {
  path: string
  previousPath: string | null
  status: string
  additions: number
  deletions: number
  patch: string | null
}

export interface MergeRequestReviewComment {
  id: number
  discussionId: string
  path: string
  body: string
  author: string | null
  authorAvatarUrl: string | null
  createdAt: string
  updatedAt: string
  line: number | null
  originalLine: number | null
  side: ReviewSide | null
  startLine: number | null
  startSide: ReviewSide | null
  inReplyToId: number | null
  commitId: string
  originalCommitId: string
  url: string
}

export interface CommitDiffFile {
  path: string
  previousPath: string | null
  status: string
  additions: number
  deletions: number
  patch: string | null
}

export interface MergeRequestReview {
  baseCommitOid: string
  startCommitOid: string
  headCommitOid: string
  files: MergeRequestReviewFile[]
  comments: MergeRequestReviewComment[]
}

export interface CreateReviewCommentInput {
  body: string
  baseSha: string
  startSha: string
  headSha: string
  path: string
  previousPath?: string
  side: ReviewSide
  line: number
  oldLine?: number
  newLine?: number
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
