export type AutomationApprovalMode = "ask" | "edits_allowed" | "all_allowed"
export type AutomationStatus = "ok" | "error" | "running"

export interface Automation {
  id: string
  workspaceId: string
  name: string
  prompt: string
  cron: string
  modelId: string | null
  mode: string
  approvalMode: AutomationApprovalMode
  threadId: string | null
  useWorktree: boolean
  enabled: boolean
  lastRunAt: number | null
  lastStatus: AutomationStatus | null
  lastError: string | null
  createdAt: number
}

export interface AutomationRun {
  id: string
  automationId: string
  threadId: string | null
  startedAt: number
  finishedAt: number | null
  status: "running" | "ok" | "error"
  error: string | null
  trigger: "scheduled" | "manual"
}

export interface AutomationInput {
  name: string
  prompt: string
  cron: string
  modelId?: string | null
  mode?: string
  approvalMode?: AutomationApprovalMode
  useWorktree?: boolean
  enabled?: boolean
}

export interface RunResult {
  status: "ok" | "error" | "skipped"
  threadId?: string
  error?: string
}
