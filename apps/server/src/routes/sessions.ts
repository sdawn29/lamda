import { Hono } from "hono";
import { join, relative } from "path";
import { readdir, stat } from "fs/promises";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import type { WebSocket } from "ws";
import {
  insertWorkspace,
  insertThread,
  getThread,
  getWorkspace,
  insertUserBlock,
  insertAssistantStartBlock,
  insertToolBlock,
  insertCompactionBlock,
  insertAbortBlock,
  listMessageBlocks,
  listMessageBlocksPage,
  listRunningToolBlocks,
  updateThreadSessionFile,
  updateAssistantBlockContent,
  finalizeAssistantBlock,
  updateToolBlockResult,
  deleteMessageBlocksFrom,
  listAgentTurns,
  getAgentTurnFiles,
  getAgentTurnsFromId,
  deleteAgentTurnsFrom,
} from "@lamda/db";
import { store } from "../store.js";
import { sessionEvents } from "../session-events.js";
import {
  createSessionForThread,
  ensureSessionEventHub,
  openSessionForThread,
} from "../services/session-service.js";
import { submitAnswer } from "../services/question-registry.js";
import { submitApproval } from "../services/approval-registry.js";
import {
  readSessionHistory,
  stripModePreamble,
  stripMemoryPreamble,
} from "@lamda/pi-sdk";
import { withInjections } from "../services/prompt-injection.js";
import { recoverSession } from "../services/healing-service.js";
import { findAttachmentFile, writeAttachment } from "../lib/attachments.js";
import type { AttachmentMetadata } from "@lamda/db";

/** Extension → MIME type for serving attachments (fallback: octet-stream). */
const ATTACHMENT_MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  txt: "text/plain; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  json: "application/json",
  csv: "text/csv; charset=utf-8",
  pdf: "application/pdf",
};
import type { PromptOptions, SdkConfig } from "@lamda/pi-sdk";
import { promises as fs } from "node:fs";
import {
  gitUnstage,
  gitRevertFile,
  gitRestoreFileFromRef,
  gitDeleteCheckpointRef,
  gitStashCreate,
  gitWriteCheckpointRef,
} from "@lamda/git";

const EXCLUDED_DIRS = new Set([".git"]);

const sessions = new Hono();

sessions.post("/session", async (c) => {
  const body = await c.req
    .json<Partial<SdkConfig>>()
    .catch((): Partial<SdkConfig> => ({}));
  const resolvedCwd = body.cwd ?? process.cwd();
  const workspaceId = insertWorkspace("Untitled", resolvedCwd);
  const threadId = insertThread(workspaceId);
  const sessionId = await createSessionForThread(
    threadId,
    resolvedCwd,
    workspaceId,
    {
      anthropicApiKey: body.anthropicApiKey,
      provider: body.provider,
      model: body.model,
    },
  );
  return c.json({ sessionId }, 201);
});

sessions.delete("/session/:id", async (c) => {
  const id = c.req.param("id");
  await sessionEvents.dispose(id);
  if (!store.delete(id)) return c.json({ error: "Not found" }, 404);
  return new Response(null, { status: 204 });
});

sessions.post("/session/:id/abort", async (c) => {
  const id = c.req.param("id");
  const entry = store.get(id);
  if (!entry) return c.json({ error: "Not found" }, 404);

  try {
    await entry.handle.abort();
    insertAbortBlock(entry.threadId);
    return c.json({ aborted: true });
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});

sessions.post("/session/:id/dismiss-error", (c) => {
  const id = c.req.param("id");
  sessionEvents.dismissPendingErrors(id);
  return c.json({ ok: true });
});

sessions.get("/session/:id/status", (c) => {
  const id = c.req.param("id");
  if (!store.has(id)) return c.json({ error: "Not found" }, 404);
  return c.json(sessionEvents.getStatus(id));
});

interface AttachmentUpload {
  id: string;
  filename: string;
  mediaType: string;
  size: number;
  kind: "image" | "text" | "file";
  data: string; // base64-encoded
}

interface PromptRequestBody {
  text?: string;
  provider?: string;
  model?: string;
  thinkingLevel?: string;
  /** File attachments (images and text files) */
  attachments?: AttachmentUpload[];
  /** Image attachments for the prompt (legacy, prefer attachments) */
  images?: PromptOptions["images"];
  /** How to queue when agent is streaming: "steer" (interrupt) or "followUp" (wait) */
  streamingBehavior?: PromptOptions["streamingBehavior"];
  /** Whether to expand file-based prompt templates (default: true) */
  expandPromptTemplates?: PromptOptions["expandPromptTemplates"];
}

sessions.post("/session/:id/prompt", async (c) => {
  const id = c.req.param("id");
  const entry = store.get(id);
  if (!entry) return c.json({ error: "Not found" }, 404);

  const body = await c.req
    .json<PromptRequestBody>()
    .catch((): PromptRequestBody => ({}));
  // Allow attachment-only sends: require text OR at least one attachment.
  if (!body.text && !(body.attachments && body.attachments.length > 0)) {
    return c.json({ error: "text or attachments required" }, 400);
  }

  ensureSessionEventHub(id, entry);

  // Fire and forget — events arrive via GET /session/:id/events
  const run = async () => {
    // Process attachments: write to disk and build agent-facing prompt
    const attachmentMetadata: AttachmentMetadata[] = [];
    let agentFacingText = body.text || "";
    const imageContents: PromptOptions["images"] = [];

    if (body.attachments && body.attachments.length > 0) {
      for (const attachment of body.attachments) {
        try {
          const { path, ...metadata } = await writeAttachment(
            entry.threadId,
            attachment.filename,
            attachment.mediaType,
            attachment.data,
            attachment.kind,
            attachment.id
          );
          // Persist metadata only (no absolute fs path) on the user message.
          attachmentMetadata.push(metadata);

          // Build ImageContent for images (flat base64 + mimeType, matching
          // the underlying agent's expected content shape).
          if (attachment.kind === "image") {
            imageContents.push({
              type: "image",
              data: attachment.data,
              mimeType: attachment.mediaType,
            });
          }
          // Inject text file contents into agent-facing prompt.
          else if (attachment.kind === "text") {
            const fileContent = Buffer.from(attachment.data, "base64").toString("utf-8");
            agentFacingText += `\n\nThe user attached "${attachment.filename}":\n\`\`\`\n${fileContent}\n\`\`\``;
          }
          // Other (binary) files can't be inlined — point the agent at the
          // saved file so it can inspect it with its tools if needed.
          else {
            agentFacingText += `\n\n[The user attached a file "${attachment.filename}" (${attachment.mediaType || "unknown type"}, ${metadata.size} bytes), saved at: ${path}]`;
          }
        } catch (err) {
          console.error(`[prompt:${id}] Failed to process attachment ${attachment.filename}:`, err);
          // Continue processing other attachments rather than failing the whole prompt
        }
      }
    }

    // Store user message as a block in the database (without the mode preamble)
    // Pass the original displayed text and attachment metadata
    insertUserBlock(entry.threadId, body.text || "", attachmentMetadata);

    // The SDK sees the mode/memory preambles and injected file contents
    const text = await withInjections(entry, agentFacingText);
    // Kept so session-level self-healing can re-send the interrupted prompt.
    entry.lastPromptText = text;

    if (body.provider && body.model)
      await entry.handle.setModel(body.provider, body.model);
    if (body.thinkingLevel) {
      entry.handle.setThinkingLevel(
        body.thinkingLevel as
          | "off"
          | "minimal"
          | "low"
          | "medium"
          | "high"
          | "xhigh",
      );
      sessionEvents.setNextThinkingLevel(id, body.thinkingLevel);
    }

    // Combine images from attachments with legacy images field
    const allImages = [
      ...imageContents,
      ...(body.images || []),
    ];

    const promptOptions: PromptOptions | undefined =
      allImages.length > 0 ||
      body.streamingBehavior !== undefined ||
      body.expandPromptTemplates !== undefined
        ? {
            images: allImages.length > 0 ? allImages : undefined,
            streamingBehavior: body.streamingBehavior,
            expandPromptTemplates: body.expandPromptTemplates,
          }
        : undefined;

    await entry.handle.prompt(text, promptOptions);
  };
  run().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[prompt:${id}]`, err);
    sessionEvents.emitError(id, message);
    // Rebuild the handle under the same sessionId so the user's retry works.
    void recoverSession(id);
  });

  return c.json({ accepted: true }, 202);
});

/**
 * Queue a steering message while the agent is running.
 * Delivered after the current assistant turn finishes its tool calls.
 */
sessions.post("/session/:id/steer", async (c) => {
  const id = c.req.param("id");
  const entry = store.get(id);
  if (!entry) return c.json({ error: "Not found" }, 404);

  const body = await c.req
    .json<{ text?: string }>()
    .catch((): { text?: string } => ({}));
  if (!body.text) return c.json({ error: "text is required" }, 400);

  ensureSessionEventHub(id, entry);

  // Store user message as a block in the database (without the mode preamble)
  insertUserBlock(entry.threadId, body.text);

  const text = await withInjections(entry, body.text);

  // Fire and forget
  entry.handle.steer(text).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[steer:${id}]`, err);
    sessionEvents.emitError(id, message);
  });

  return c.json({ accepted: true }, 202);
});

/**
 * Queue a follow-up message to be processed after the agent finishes.
 * Only delivered when agent has no more tool calls or steering messages.
 */
sessions.post("/session/:id/follow-up", async (c) => {
  const id = c.req.param("id");
  const entry = store.get(id);
  if (!entry) return c.json({ error: "Not found" }, 404);

  const body = await c.req
    .json<{ text?: string }>()
    .catch((): { text?: string } => ({}));
  if (!body.text) return c.json({ error: "text is required" }, 400);

  ensureSessionEventHub(id, entry);

  // Store user message as a block in the database (without the mode preamble)
  insertUserBlock(entry.threadId, body.text);

  const text = await withInjections(entry, body.text);

  // Fire and forget
  entry.handle.followUp(text).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[followUp:${id}]`, err);
    sessionEvents.emitError(id, message);
  });

  return c.json({ accepted: true }, 202);
});

/**
 * Submit the user's answer to a pending `question` tool call. Resolves the
 * blocked tool's `execute` so the agent turn continues with the selection.
 */
sessions.post("/session/:id/answer", async (c) => {
  const id = c.req.param("id");
  if (!store.has(id)) return c.json({ error: "Not found" }, 404);

  const body = await c.req
    .json<{ toolCallId?: string; answer?: string }>()
    .catch((): { toolCallId?: string; answer?: string } => ({}));
  if (!body.toolCallId || typeof body.answer !== "string") {
    return c.json({ error: "toolCallId and answer are required" }, 400);
  }

  const accepted = submitAnswer(body.toolCallId, body.answer);
  if (!accepted) {
    return c.json({ error: "No pending question for that toolCallId" }, 404);
  }
  return c.json({ ok: true });
});

/**
 * Submit the user's decision for a paused tool call. Resolves the blocked
 * approval bridge so the agent either runs or skips the tool.
 */
sessions.post("/session/:id/tool-approval", async (c) => {
  const id = c.req.param("id");
  if (!store.has(id)) return c.json({ error: "Not found" }, 404);

  const body = await c.req
    .json<{ toolCallId?: string; decision?: string }>()
    .catch((): { toolCallId?: string; decision?: string } => ({}));
  if (
    !body.toolCallId ||
    (body.decision !== "once" &&
      body.decision !== "always" &&
      body.decision !== "never" &&
      body.decision !== "reject")
  ) {
    return c.json(
      {
        error:
          "toolCallId and decision ('once'|'always'|'never'|'reject') are required",
      },
      400,
    );
  }

  const accepted = submitApproval(body.toolCallId, body.decision);
  if (!accepted) {
    return c.json({ error: "No pending approval for that toolCallId" }, 404);
  }
  return c.json({ ok: true });
});

sessions.get("/session/:id/commands", (c) => {
  const id = c.req.param("id");
  const entry = store.get(id);
  if (!entry) return c.json({ commands: [] });
  return c.json({ commands: entry.handle.getCommands() });
});

sessions.get("/session/:id/thinking-levels", (c) => {
  const id = c.req.param("id");
  const entry = store.get(id);
  if (!entry) return c.json({ levels: [] });
  return c.json({ levels: entry.handle.getAvailableThinkingLevels() });
});

sessions.get("/session/:id/context-usage", (c) => {
  const id = c.req.param("id");
  const entry = store.get(id);
  if (!entry) return c.json({ contextUsage: null });
  const usage = entry.handle.getContextUsage();
  return c.json({ contextUsage: usage ?? null });
});

sessions.get("/session/:id/stats", (c) => {
  const id = c.req.param("id");
  const entry = store.get(id);
  if (!entry) return c.json({ stats: null });
  try {
    const stats = entry.handle.getSessionStats();
    return c.json({ stats });
  } catch (err) {
    console.error(`[stats:${id}]`, err);
    return c.json({
      stats: null,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

sessions.post("/session/:id/compact", async (c) => {
  const id = c.req.param("id");
  const entry = store.get(id);
  if (!entry) return c.json({ error: "Session not found" }, 404);
  ensureSessionEventHub(id, entry);
  try {
    await entry.handle.compact();
    return c.json({ ok: true });
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});

/**
 * Get message blocks for a session's thread.
 * Supports optional cursor-based pagination via ?limit=N&before=blockIndex.
 * Without params returns all blocks (used internally by fork seeding).
 */
sessions.get("/session/:id/messages", (c) => {
  const id = c.req.param("id");
  const threadId = store.getThreadId(id);
  if (!threadId) return c.json({ error: "Session not found" }, 404);

  const limitParam = c.req.query("limit");
  const beforeParam = c.req.query("before");

  if (limitParam !== undefined) {
    const limit = Math.min(Math.max(1, parseInt(limitParam, 10) || 50), 200);
    const before =
      beforeParam !== undefined ? parseInt(beforeParam, 10) : undefined;
    const page = listMessageBlocksPage(threadId, limit, before);
    return c.json(page);
  }

  const blocks = listMessageBlocks(threadId);
  return c.json({ blocks, hasMore: false });
});

/**
 * Get running tool blocks for a session's thread.
 * Returns tool blocks that are currently running (for state restoration).
 */
sessions.get("/session/:id/running-tools", (c) => {
  const id = c.req.param("id");
  const threadId = store.getThreadId(id);
  if (!threadId) return c.json({ error: "Session not found" }, 404);

  const runningTools = listRunningToolBlocks(threadId);
  return c.json({ runningTools });
});

sessions.get("/session/:id/workspace-files", async (c) => {
  const cwd = store.getCwd(c.req.param("id"));
  if (!cwd) return c.json({ error: "Session not found" }, 404);
  try {
    const rawEntries = await readdir(cwd, {
      withFileTypes: true,
      recursive: true,
    });
    const entries: { path: string; type: "file" | "dir" }[] = [];
    for (const entry of rawEntries) {
      const fullPath = join(entry.parentPath, entry.name);
      const rel = relative(cwd, fullPath).replace(/\\/g, "/");
      if (rel.split("/").some((p) => EXCLUDED_DIRS.has(p))) continue;
      if (entry.isDirectory()) entries.push({ path: rel, type: "dir" });
      else if (entry.isFile()) entries.push({ path: rel, type: "file" });
    }
    entries.sort((a, b) => a.path.localeCompare(b.path));
    return c.json({ entries });
  } catch {
    return c.json({ entries: [] });
  }
});

/**
 * Revert the conversation and code to the state before a specific user message.
 * Removes the message and all subsequent blocks from the DB, reverts code changes
 * made in all agent turns that ran after the message, and truncates the session
 * history file so the AI won't see the removed exchanges.
 * Returns { text } — the text of the reverted user message so the UI can
 * pre-fill the input box.
 */
sessions.post("/session/:id/revert-to-message", async (c) => {
  const sessionId = c.req.param("id");
  const body = await c.req
    .json<{ blockId?: string }>()
    .catch((): { blockId?: string } => ({}));
  if (!body.blockId) return c.json({ error: "blockId is required" }, 400);

  const entry = store.get(sessionId);
  if (!entry) return c.json({ error: "Session not found" }, 404);

  const cwd = entry.cwd;
  const threadId = entry.threadId;

  // Find the target user block in the thread.
  const allBlocks = listMessageBlocks(threadId);
  const blockIndex = allBlocks.findIndex((b) => b.id === body.blockId);
  if (blockIndex === -1)
    return c.json({ error: "Block not found in thread" }, 404);

  const targetBlock = allBlocks[blockIndex];
  if (targetBlock?.role !== "user")
    return c.json({ error: "Block is not a user message" }, 400);

  const targetBlockIndex = targetBlock.blockIndex;
  const messageCreatedAt = targetBlock.createdAt;
  const messageText = targetBlock.content ?? "";

  // Truncate the session JSONL so the AI doesn't see the reverted exchanges.
  const userBlocks = allBlocks.filter((b) => b.role === "user");
  const userMessageIndex = userBlocks.findIndex((b) => b.id === body.blockId);
  try {
    const newSessionFile = await entry.handle.fork(userMessageIndex);
    // Swap the session handle in place — same sessionId, fresh truncated history.
    store.replaceHandle(
      sessionId,
      await openSessionForThread(
        threadId,
        newSessionFile,
        cwd,
        entry.workspaceId,
      ),
    );
    updateThreadSessionFile(threadId, newSessionFile);

    // Re-attach the event hub to the new handle.
    await sessionEvents.dispose(sessionId);
    const newEntry = store.get(sessionId);
    if (newEntry) {
      sessionEvents.ensure(sessionId, threadId, newEntry.handle, cwd);
    }
  } catch (err) {
    console.error("[revert-to-message] session truncation failed:", err);
    // Non-fatal — proceed with DB + code revert even if session file update fails.
  }

  // ── Revert code changes ─────────────────────────────────────────────────────
  // Find all agent turns for this thread that started at or after the user message.
  const allTurns = listAgentTurns(threadId);
  // allTurns is sorted newest-first; find the oldest turn to revert from.
  const firstTurnToRevert = [...allTurns]
    .reverse()
    .find((t) => t.startedAt >= messageCreatedAt);

  if (firstTurnToRevert) {
    const turnsToRevert = getAgentTurnsFromId(threadId, firstTurnToRevert.id);
    const fileTargetMap = new Map<
      string,
      ReturnType<typeof getAgentTurnFiles>[number]
    >();
    const earliestCheckpointSha = turnsToRevert[0]?.checkpointSha ?? "";

    for (const turn of turnsToRevert) {
      for (const file of getAgentTurnFiles(turn.id)) {
        if (!fileTargetMap.has(file.filePath)) {
          fileTargetMap.set(file.filePath, file);
        }
      }
    }

    const errors: string[] = [];
    for (const [, file] of fileTargetMap) {
      const fullPath = join(cwd, file.filePath);
      try {
        if (file.wasCreatedByTurn) {
          await fs.unlink(fullPath).catch(() => {});
          await gitUnstage(cwd, file.filePath).catch(() => {});
        } else if (earliestCheckpointSha) {
          await gitRestoreFileFromRef(
            cwd,
            earliestCheckpointSha,
            file.filePath,
          ).catch(async () => {
            if (file.preContent !== null) {
              await fs.writeFile(fullPath, file.preContent, "utf8");
              await gitUnstage(cwd, file.filePath).catch(() => {});
            } else {
              await gitRevertFile(
                cwd,
                file.filePath,
                file.postStatusCode,
              ).catch((err) => {
                errors.push(
                  `${file.filePath}: ${err instanceof Error ? err.message : String(err)}`,
                );
              });
            }
          });
        } else if (file.preContent !== null) {
          await fs.writeFile(fullPath, file.preContent, "utf8");
          await gitUnstage(cwd, file.filePath).catch(() => {});
        } else {
          await gitRevertFile(cwd, file.filePath, file.postStatusCode).catch(
            (err) => {
              errors.push(
                `${file.filePath}: ${err instanceof Error ? err.message : String(err)}`,
              );
            },
          );
        }
      } catch (err) {
        errors.push(
          `${file.filePath}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    if (errors.length > 0) {
      console.error(
        "[revert-to-message] some files could not be reverted:",
        errors,
      );
    }

    const orphanedShas = deleteAgentTurnsFrom(threadId, firstTurnToRevert.id);
    // Drop the now-unreferenced checkpoint refs so they don't accumulate.
    await Promise.all(
      orphanedShas.map((sha) => gitDeleteCheckpointRef(cwd, sha)),
    );
  }

  // Also clear any in-progress turn state from the event hub.
  sessionEvents.clearLastTurnFiles(sessionId);

  // ── Remove message blocks from the target forward ─────────────────────────
  deleteMessageBlocksFrom(threadId, targetBlockIndex);

  return c.json({ text: messageText });
});

/**
 * Fork a conversation at a specific user message.
 * Creates a new thread branched from that point, returns the new threadId and sessionId.
 */
sessions.post("/session/:id/fork", async (c) => {
  const sessionId = c.req.param("id");
  const body = await c.req
    .json<{ blockId?: string }>()
    .catch((): { blockId?: string } => ({}));
  if (!body.blockId) return c.json({ error: "blockId is required" }, 400);

  const entry = store.get(sessionId);
  if (!entry) return c.json({ error: "Session not found" }, 404);
  if (!entry.workspaceId)
    return c.json({ error: "Session has no workspace" }, 400);

  // Map blockId → position among user messages in this thread
  const allBlocks = listMessageBlocks(entry.threadId);
  const userBlocks = allBlocks.filter((b) => b.role === "user");
  const userMessageIndex = userBlocks.findIndex((b) => b.id === body.blockId);
  if (userMessageIndex === -1)
    return c.json({ error: "Block not found in thread" }, 404);

  // The forked user message goes to the input field — capture its text before forking
  const initialInput = userBlocks[userMessageIndex]?.content ?? "";

  let newSessionFile: string;
  try {
    newSessionFile = await entry.handle.fork(userMessageIndex);
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }

  const parentThread = getThread(entry.threadId);
  const parentTitle = parentThread?.title ?? "Thread";
  const forkTitle = `Fork of ${parentTitle}`;

  // Capture a durable snapshot of the working tree at the moment of branching so
  // the new branch records its own divergence point, independent of the parent's
  // turn checkpoints (which may later be reverted or pruned). Best-effort: an
  // empty sha (clean tree / non-git / timeout) just means no snapshot to anchor.
  let baseCheckpointSha = "";
  try {
    baseCheckpointSha = await gitStashCreate(entry.cwd);
    if (baseCheckpointSha)
      await gitWriteCheckpointRef(entry.cwd, baseCheckpointSha).catch(() => {});
  } catch {
    baseCheckpointSha = "";
  }

  const newThreadId = insertThread(entry.workspaceId, {
    title: forkTitle,
    forkedFromId: entry.threadId,
    baseCheckpointSha: baseCheckpointSha || undefined,
  });
  updateThreadSessionFile(newThreadId, newSessionFile);
  const forkWorkspacePath = getWorkspace(entry.workspaceId)?.path ?? entry.cwd;

  // Seed message blocks from the branched JSONL so history appears immediately.
  // The last user message is intentionally skipped — it goes to the input field.
  try {
    const history = readSessionHistory(newSessionFile);
    let lastUserIdx = -1;
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].role === "user") {
        lastUserIdx = i;
        break;
      }
    }
    for (let i = 0; i < history.length; i++) {
      const block = history[i];
      if (i === lastUserIdx) continue;
      if (block.role === "user") {
        // History stores the preamble-augmented text; strip the injected blocks
        // so the forked thread shows the original user message, matching the live
        // send path. Order mirrors composition: mode preamble (outermost) first,
        // then the memory block.
        insertUserBlock(
          newThreadId,
          stripMemoryPreamble(stripModePreamble(block.content)),
          undefined,
          block.createdAt,
        );
      } else if (block.role === "assistant") {
        const blockId = insertAssistantStartBlock(newThreadId, block.createdAt);
        updateAssistantBlockContent(
          blockId,
          block.content,
          block.thinking || undefined,
          block.model || undefined,
          block.provider || undefined,
        );
        if (block.errorMessage) {
          finalizeAssistantBlock(blockId, { errorMessage: block.errorMessage });
        }
      } else if (block.role === "tool") {
        const toolBlockId = insertToolBlock(
          newThreadId,
          block.toolCallId,
          block.toolName,
          block.toolArgs,
          block.createdAt,
        );
        updateToolBlockResult(toolBlockId, {
          status: block.isError ? "error" : "done",
          result: block.toolResult,
        });
      } else if (block.role === "compaction") {
        insertCompactionBlock(newThreadId, "manual", block.createdAt);
      }
    }
  } catch (err) {
    console.error("[fork] history seeding failed (non-fatal):", err);
  }

  const forkedHandle = await openSessionForThread(
    newThreadId,
    newSessionFile,
    forkWorkspacePath,
    entry.workspaceId,
  );
  const newSessionId = store.create(
    forkedHandle,
    forkWorkspacePath,
    newThreadId,
    entry.workspaceId,
  );
  sessionEvents.ensure(
    newSessionId,
    newThreadId,
    forkedHandle,
    forkWorkspacePath,
  );

  return c.json(
    { threadId: newThreadId, sessionId: newSessionId, initialInput },
    201,
  );
});

// Serve attachment files (images and text files)
sessions.get("/attachment/:threadId/:attachmentId", async (c) => {
  const threadId = c.req.param("threadId");
  const attachmentId = c.req.param("attachmentId");

  if (!threadId || !attachmentId) {
    return c.json({ error: "threadId and attachmentId are required" }, 400);
  }

  // Reject path-traversal attempts — ids are plain UUIDs with no separators.
  const isSafe = (s: string) => /^[A-Za-z0-9_-]+$/.test(s);
  if (!isSafe(threadId) || !isSafe(attachmentId)) {
    return c.json({ error: "Invalid attachment identifier" }, 400);
  }

  // Locate the stored file regardless of its (arbitrary) extension.
  const foundPath = await findAttachmentFile(threadId, attachmentId);
  if (!foundPath) {
    return c.json({ error: "Attachment not found" }, 404);
  }

  let fileStat;
  try {
    fileStat = await stat(foundPath);
  } catch (err: any) {
    return c.json(
      { error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }

  const ext = foundPath.split(".").pop()?.toLowerCase() || "";
  const contentType = ATTACHMENT_MIME_TYPES[ext] ?? "application/octet-stream";
  // Non-previewable types download with their original-ish name.
  const isInline = contentType.startsWith("image/") || contentType.startsWith("text/");

  const size = fileStat.size;
  const nodeStream = createReadStream(foundPath);
  const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

  return c.body(webStream, 200, {
    "Content-Type": contentType,
    "Content-Length": String(size),
    "Content-Disposition": isInline ? "inline" : "attachment",
    "Cache-Control": "public, immutable",
  });
});

export function handleSessionEventsWs(
  ws: WebSocket,
  id: string,
  lastEventId?: string,
) {
  const entry = store.get(id);
  if (!entry) {
    ws.send(JSON.stringify({ type: "server_error", message: "Not found" }));
    ws.close();
    return;
  }

  const hub = ensureSessionEventHub(id, entry);

  const onEvent = (record: {
    id: number;
    event: { type: string };
    data: string;
  }) => {
    if (ws.readyState !== 1 /* OPEN */) return;
    ws.send(`{"id":${record.id},${record.data.slice(1)}`);
  };

  const subscription = hub.subscribe({ lastEventId, onEvent });

  for (const record of subscription.initialEvents) {
    if (ws.readyState !== 1 /* OPEN */) break;
    ws.send(`{"id":${record.id},${record.data.slice(1)}`);
  }

  ws.on("close", () => subscription.unsubscribe());
  ws.on("error", () => subscription.unsubscribe());

  subscription.closed.then(() => {
    if (ws.readyState === 1 /* OPEN */) ws.close();
  });
}

export default sessions;
