/**
 * Unified WebSocket handler for session commands.
 * Processes client messages and broadcasts results.
 */

import type { WebSocket } from "ws";
import { insertUserBlock, insertAbortBlock } from "@lamda/db";
import {
  gitStage,
  gitUnstage,
  gitStageAll,
  gitUnstageAll,
  gitCommit,
  checkoutBranch,
  createBranch,
  gitPush,
  gitStash,
  gitStashPop,
  gitStashApply,
  gitStashDrop,
  gitRevertFile,
  initGitRepo,
  getCurrentBranch,
  listBranches,
  gitStatus,
  gitStashList,
  gitStagedDiff,
} from "@lamda/git";
import {
  generateCommitMessage,
  type PromptOptions,
  type ImageContent,
} from "@lamda/pi-sdk";
import { store } from "../store.js";
import { sessionEvents } from "../session-events.js";
import { ensureSessionEventHub, gitCwd } from "../services/session-service.js";
import {
  type ClientMessage,
  type ServerMessage,
  type PromptMessage,
  type SteerMessage,
  type FollowUpMessage,
  type AbortMessage,
  type CompactMessage,
  type GitCommandMessage,
  type GitStageMessage,
  type GitUnstageMessage,
  type GitStageAllMessage,
  type GitUnstageAllMessage,
  type GitCommitMessage,
  type GitCheckoutMessage,
  type GitBranchMessage,
  type GitPushMessage,
  type GitStashMessage,
  type GitStashPopMessage,
  type GitStashApplyMessage,
  type GitStashDropMessage,
  type GitRevertFileMessage,
  type GitInitMessage,
} from "./types.js";

function parseGitError(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : String(err);
  const lines = raw.split("\n").filter(Boolean);
  return (
    lines.find((l) => l.startsWith("error:") || l.startsWith("fatal:")) ??
    lines[0] ??
    fallback
  );
}

export function handleSessionCommands(ws: WebSocket, sessionId: string) {
  const entry = store.get(sessionId);
  if (!entry) {
    send(ws, { type: "server_error", message: "Session not found" });
    ws.close();
    return;
  }

  ws.on("message", async (data) => {
    try {
      const msg = JSON.parse(data.toString()) as ClientMessage;
      await processMessage(ws, sessionId, entry, msg);
    } catch (err) {
      console.error(`[ws:session:${sessionId}] message parse error:`, err);
      send(ws, { type: "server_error", message: "Invalid message format" });
    }
  });

  ws.on("error", (err) => {
    console.error(`[ws:session:${sessionId}] error:`, err);
  });
}

async function processMessage(
  ws: WebSocket,
  sessionId: string,
  entry: NonNullable<ReturnType<typeof store.get>>,
  msg: ClientMessage,
) {
  switch (msg.type) {
    case "prompt":
      await handlePrompt(ws, sessionId, entry, msg);
      break;
    case "steer":
      await handleSteer(ws, sessionId, entry, msg);
      break;
    case "follow-up":
      await handleFollowUp(ws, sessionId, entry, msg);
      break;
    case "abort":
      await handleAbort(ws, sessionId, entry, msg);
      break;
    case "compact":
      await handleCompact(ws, sessionId, entry, msg);
      break;
    case "git:stage":
    case "git:unstage":
    case "git:stage-all":
    case "git:unstage-all":
    case "git:commit":
    case "git:checkout":
    case "git:branch":
    case "git:push":
    case "git:stash":
    case "git:stash-pop":
    case "git:stash-apply":
    case "git:stash-drop":
    case "git:revert-file":
    case "git:init":
      await handleGitCommand(ws, sessionId, msg as GitCommandMessage);
      break;
    default:
      send(ws, { type: "server_error", message: `Unknown message type` });
  }
}

async function handlePrompt(
  ws: WebSocket,
  sessionId: string,
  entry: NonNullable<ReturnType<typeof store.get>>,
  msg: PromptMessage,
) {
  if (!msg.text) {
    send(ws, { type: "ack", clientId: msg.id, operation: "prompt", accepted: false });
    return;
  }

  ensureSessionEventHub(sessionId, entry);
  insertUserBlock(entry.threadId, msg.text);

  // Acknowledge immediately
  send(ws, { type: "ack", clientId: msg.id, operation: "prompt", accepted: true });

  // Run the prompt
  const run = async () => {
    try {
      if (msg.provider && msg.model) {
        await entry.handle.setModel(msg.provider, msg.model);
      }
      if (msg.thinkingLevel) {
        entry.handle.setThinkingLevel(
          msg.thinkingLevel as "off" | "minimal" | "low" | "medium" | "high" | "xhigh",
        );
        sessionEvents.setNextThinkingLevel(sessionId, msg.thinkingLevel);
      }

      // Transform images to pi-sdk format
      const images: ImageContent[] | undefined = msg.images?.map((img) => ({
        type: "image" as const,
        source: {
          type: "base64" as const,
          mediaType: img.mediaType,
          data: img.data,
        },
      }));

      const promptOptions: PromptOptions | undefined =
        images || msg.streamingBehavior !== undefined || msg.expandPromptTemplates !== undefined
          ? {
              images,
              streamingBehavior: msg.streamingBehavior,
              expandPromptTemplates: msg.expandPromptTemplates,
            }
          : undefined;

      await entry.handle.prompt(msg.text, promptOptions);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[prompt:${sessionId}]`, err);
      sessionEvents.emitError(sessionId, message);
    }
  };

  run();
}

async function handleSteer(
  ws: WebSocket,
  sessionId: string,
  entry: NonNullable<ReturnType<typeof store.get>>,
  msg: SteerMessage,
) {
  if (!msg.text) {
    send(ws, { type: "ack", operation: "steer", accepted: false });
    return;
  }

  ensureSessionEventHub(sessionId, entry);
  insertUserBlock(entry.threadId, msg.text);

  send(ws, { type: "ack", operation: "steer", accepted: true });

  entry.handle.steer(msg.text).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[steer:${sessionId}]`, err);
    sessionEvents.emitError(sessionId, message);
  });
}

async function handleFollowUp(
  ws: WebSocket,
  sessionId: string,
  entry: NonNullable<ReturnType<typeof store.get>>,
  msg: FollowUpMessage,
) {
  if (!msg.text) {
    send(ws, { type: "ack", operation: "follow-up", accepted: false });
    return;
  }

  ensureSessionEventHub(sessionId, entry);
  insertUserBlock(entry.threadId, msg.text);

  send(ws, { type: "ack", operation: "follow-up", accepted: true });

  entry.handle.followUp(msg.text).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[followUp:${sessionId}]`, err);
    sessionEvents.emitError(sessionId, message);
  });
}

async function handleAbort(
  ws: WebSocket,
  sessionId: string,
  entry: NonNullable<ReturnType<typeof store.get>>,
  _msg: AbortMessage,
) {
  insertAbortBlock(entry.threadId);

  try {
    await entry.handle.abort();
    send(ws, { type: "ack", operation: "abort", accepted: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    send(ws, { type: "git:result", sessionId, operation: "abort", success: false, error: message });
  }
}

async function handleCompact(
  ws: WebSocket,
  sessionId: string,
  entry: NonNullable<ReturnType<typeof store.get>>,
  _msg: CompactMessage,
) {
  try {
    await entry.handle.compact();
    send(ws, { type: "ack", operation: "compact", accepted: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    send(ws, { type: "git:result", sessionId, operation: "compact", success: false, error: message });
  }
}

async function handleGitCommand(ws: WebSocket, sessionId: string, msg: GitCommandMessage) {
  const cwd = gitCwd(sessionId);
  if (!cwd) {
    send(ws, { type: "server_error", message: "Session not found" });
    return;
  }

  try {
    switch (msg.type) {
      case "git:stage": {
        const m = msg as GitStageMessage;
        await gitStage(cwd, m.filePath);
        send(ws, { type: "git:result", sessionId, operation: "git:stage", success: true });
        broadcastGitStatus(ws, sessionId, cwd);
        break;
      }
      case "git:unstage": {
        const m = msg as GitUnstageMessage;
        await gitUnstage(cwd, m.filePath);
        send(ws, { type: "git:result", sessionId, operation: "git:unstage", success: true });
        broadcastGitStatus(ws, sessionId, cwd);
        break;
      }
      case "git:stage-all": {
        send(ws, { type: "git:progress", sessionId, operation: "staging", current: 0, total: 1 });
        await gitStageAll(cwd);
        send(ws, { type: "git:result", sessionId, operation: "git:stage-all", success: true });
        broadcastGitStatus(ws, sessionId, cwd);
        break;
      }
      case "git:unstage-all": {
        await gitUnstageAll(cwd);
        send(ws, { type: "git:result", sessionId, operation: "git:unstage-all", success: true });
        broadcastGitStatus(ws, sessionId, cwd);
        break;
      }
      case "git:commit": {
        const m = msg as GitCommitMessage;
        send(ws, { type: "git:progress", sessionId, operation: "committing", current: 0, total: 1 });
        const output = await gitCommit(cwd, m.message);
        send(ws, { type: "git:result", sessionId, operation: "git:commit", success: true, data: { output } });
        broadcastGitStatus(ws, sessionId, cwd);
        break;
      }
      case "git:checkout": {
        const m = msg as GitCheckoutMessage;
        send(ws, { type: "git:progress", sessionId, operation: "checkout", current: 0, total: 1 });
        await checkoutBranch(cwd, m.branch);
        send(ws, { type: "git:result", sessionId, operation: "git:checkout", success: true, data: { branch: await getCurrentBranch(cwd) } });
        broadcastGitStatus(ws, sessionId, cwd);
        break;
      }
      case "git:branch": {
        const m = msg as GitBranchMessage;
        await createBranch(cwd, m.branch);
        send(ws, { type: "git:result", sessionId, operation: "git:branch", success: true, data: { branch: await getCurrentBranch(cwd) } });
        broadcastGitStatus(ws, sessionId, cwd);
        break;
      }
      case "git:push": {
        send(ws, { type: "git:progress", sessionId, operation: "pushing", current: 0, total: 1 });
        await gitPush(cwd);
        send(ws, { type: "git:result", sessionId, operation: "git:push", success: true });
        broadcastGitStatus(ws, sessionId, cwd);
        break;
      }
      case "git:stash": {
        const m = msg as GitStashMessage;
        await gitStash(cwd, m.message);
        send(ws, { type: "git:result", sessionId, operation: "git:stash", success: true });
        broadcastGitStatus(ws, sessionId, cwd);
        break;
      }
      case "git:stash-pop": {
        const m = msg as GitStashPopMessage;
        await gitStashPop(cwd, m.ref);
        send(ws, { type: "git:result", sessionId, operation: "git:stash-pop", success: true });
        broadcastGitStatus(ws, sessionId, cwd);
        break;
      }
      case "git:stash-apply": {
        const m = msg as GitStashApplyMessage;
        await gitStashApply(cwd, m.ref);
        send(ws, { type: "git:result", sessionId, operation: "git:stash-apply", success: true });
        broadcastGitStatus(ws, sessionId, cwd);
        break;
      }
      case "git:stash-drop": {
        const m = msg as GitStashDropMessage;
        await gitStashDrop(cwd, m.ref);
        send(ws, { type: "git:result", sessionId, operation: "git:stash-drop", success: true });
        broadcastGitStatus(ws, sessionId, cwd);
        break;
      }
      case "git:revert-file": {
        const m = msg as GitRevertFileMessage;
        await gitRevertFile(cwd, m.filePath, "");
        send(ws, { type: "git:result", sessionId, operation: "git:revert-file", success: true });
        broadcastGitStatus(ws, sessionId, cwd);
        break;
      }
      case "git:init": {
        await initGitRepo(cwd);
        send(ws, {
          type: "git:result",
          sessionId,
          operation: "git:init",
          success: true,
          data: {
            branch: await getCurrentBranch(cwd),
            branches: await listBranches(cwd),
          },
        });
        broadcastGitStatus(ws, sessionId, cwd);
        break;
      }
    }
  } catch (err) {
    const error = parseGitError(err, "Operation failed");
    send(ws, { type: "git:result", sessionId, operation: msg.type, success: false, error });
  }
}

async function broadcastGitStatus(ws: WebSocket, sessionId: string, cwd: string) {
  try {
    const status = await gitStatus(cwd);
    send(ws, { type: "git:status", sessionId, status });
  } catch {
    // Silently fail - status is best-effort
  }
}

function send(ws: WebSocket, msg: ServerMessage) {
  if (ws.readyState === 1 /* OPEN */) {
    ws.send(JSON.stringify(msg));
  }
}