/**
 * Unified WebSocket message types for session operations.
 * All session commands go through the WebSocket channel at /ws/session/:id/events
 */

import { type PromptOptions as SdkPromptOptions, type ImageContent as SdkImageContent } from "@lamda/pi-sdk";

// Re-export types for convenience
export type PromptOptions = SdkPromptOptions;
export type ImageContent = SdkImageContent;

// ── Client → Server Messages ──────────────────────────────────────────────────

export type ClientMessage =
  | PromptMessage
  | SteerMessage
  | FollowUpMessage
  | AbortMessage
  | CompactMessage
  | GitCommandMessage
  | WorkspaceCommandMessage;

export interface PromptMessage {
  type: "prompt";
  id?: string; // optional client-generated ID for correlation
  text: string;
  provider?: string;
  model?: string;
  thinkingLevel?: string;
  images?: { data: string; mediaType: string }[];
  streamingBehavior?: "steer" | "followUp";
  expandPromptTemplates?: boolean;
}

export interface SteerMessage {
  type: "steer";
  text: string;
}

export interface FollowUpMessage {
  type: "follow-up";
  text: string;
}

export interface AbortMessage {
  type: "abort";
}

export interface CompactMessage {
  type: "compact";
}

export type GitCommandMessage =
  | GitStageMessage
  | GitUnstageMessage
  | GitStageAllMessage
  | GitUnstageAllMessage
  | GitCommitMessage
  | GitCheckoutMessage
  | GitBranchMessage
  | GitPushMessage
  | GitStashMessage
  | GitStashPopMessage
  | GitStashApplyMessage
  | GitStashDropMessage
  | GitRevertFileMessage
  | GitInitMessage;

export interface GitStageMessage {
  type: "git:stage";
  filePath: string;
}

export interface GitUnstageMessage {
  type: "git:unstage";
  filePath: string;
}

export interface GitStageAllMessage {
  type: "git:stage-all";
}

export interface GitUnstageAllMessage {
  type: "git:unstage-all";
}

export interface GitCommitMessage {
  type: "git:commit";
  message: string;
}

export interface GitCheckoutMessage {
  type: "git:checkout";
  branch: string;
}

export interface GitBranchMessage {
  type: "git:branch";
  branch: string;
}

export interface GitPushMessage {
  type: "git:push";
}

export interface GitStashMessage {
  type: "git:stash";
  message?: string;
}

export interface GitStashPopMessage {
  type: "git:stash-pop";
  ref: string;
}

export interface GitStashApplyMessage {
  type: "git:stash-apply";
  ref: string;
}

export interface GitStashDropMessage {
  type: "git:stash-drop";
  ref: string;
}

export interface GitRevertFileMessage {
  type: "git:revert-file";
  filePath: string;
}

export interface GitInitMessage {
  type: "git:init";
}

export type WorkspaceCommandMessage =
  | WorkspaceReindexMessage;

export interface WorkspaceReindexMessage {
  type: "workspace:reindex";
}

// ── Server → Client Messages ─────────────────────────────────────────────────

export type ServerMessage =
  | ServerErrorMessage
  | GitStatusMessage
  | GitProgressMessage
  | GitResultMessage
  | WorkspaceProgressMessage
  | CommandAckMessage;

export interface ServerErrorMessage {
  type: "server_error";
  message: string;
}

export interface GitStatusMessage {
  type: "git:status";
  sessionId: string;
  status: string; // raw git status output
}

export interface GitProgressMessage {
  type: "git:progress";
  sessionId: string;
  operation: string; // "staging", "committing", "pushing", etc.
  current: number;
  total: number;
}

export interface GitResultMessage {
  type: "git:result";
  sessionId: string;
  operation: string;
  success: boolean;
  error?: string;
  data?: Record<string, unknown>;
}

export interface WorkspaceProgressMessage {
  type: "workspace:progress";
  workspaceId: string;
  operation: string;
  current: number;
  total: number;
}

export interface CommandAckMessage {
  type: "ack";
  clientId?: string;
  operation: string;
  accepted: boolean;
}

// ── Shared Types ─────────────────────────────────────────────────────────────

export interface GitStatus {
  tracked: TrackedFile[];
  untracked: UntrackedFile[];
  staged: string[];
}

export interface TrackedFile {
  path: string;
  indexStatus: "M" | "A" | "D" | "R" | "C" | null;
  workTreeStatus: "M" | "D" | null;
}

export interface UntrackedFile {
  path: string;
}