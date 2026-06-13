import { randomUUID } from "node:crypto";
import { eq, asc, and, max, count, desc, lt, gte } from "drizzle-orm";
import { db } from "../client.js";
import { messageBlocks } from "../schema.js";

/**
 * Attachment metadata stored with a message.
 */
export interface AttachmentMetadata {
  id: string;
  filename: string;
  mediaType: string;
  size: number;
  kind: "image" | "text" | "file";
  createdAt?: number;
}

/**
 * Complete message block structure matching pi-agent's message format.
 */
export interface MessageBlock {
  id: string;
  threadId: string;
  blockIndex: number;
  role: "user" | "assistant" | "tool" | "abort" | "compaction";
  content: string | null;
  thinking: string | null;
  model: string | null;
  provider: string | null;
  thinkingLevel: string | null;
  responseTime: number | null;
  errorMessage: string | null;
  toolCallId: string | null;
  toolName: string | null;
  toolArgs: string | null;
  toolResult: string | null;
  toolStatus: "running" | "done" | "error" | null;
  toolDuration: number | null;
  toolStartTime: number | null;
  attachments: string | null;
  createdAt: number;
}

/**
 * Convert database row to MessageBlock
 */
function toMessageBlock(row: MessageBlock): MessageBlock {
  return row;
}

/**
 * Get all message blocks for a thread, ordered by blockIndex
 */
export function listMessageBlocks(threadId: string): MessageBlock[] {
  return db
    .select()
    .from(messageBlocks)
    .where(eq(messageBlocks.threadId, threadId))
    .orderBy(asc(messageBlocks.blockIndex))
    .all()
    .map(toMessageBlock);
}

export interface MessageBlocksPage {
  blocks: MessageBlock[];
  hasMore: boolean;
}

/**
 * Get a paginated window of message blocks for a thread.
 * Fetches the `limit` most recent blocks before the given cursor `before`
 * (exclusive), returning them in chronological order.
 * Pass `before=undefined` to get the most recent blocks.
 */
export function listMessageBlocksPage(
  threadId: string,
  limit: number,
  before?: number
): MessageBlocksPage {
  const condition =
    before !== undefined
      ? and(eq(messageBlocks.threadId, threadId), lt(messageBlocks.blockIndex, before))
      : eq(messageBlocks.threadId, threadId);

  // Fetch one extra to detect whether older pages exist.
  const rows = db
    .select()
    .from(messageBlocks)
    .where(condition)
    .orderBy(desc(messageBlocks.blockIndex))
    .limit(limit + 1)
    .all()
    .map(toMessageBlock);

  const hasMore = rows.length > limit;
  const blocks = rows.slice(0, limit).reverse(); // restore chronological order

  return { blocks, hasMore };
}

/**
 * Get the next block index for a thread
 */
function getNextBlockIndex(threadId: string): number {
  const result = db
    .select({ maxIndex: max(messageBlocks.blockIndex) })
    .from(messageBlocks)
    .where(eq(messageBlocks.threadId, threadId))
    .get();
  return (result?.maxIndex ?? -1) + 1;
}

/**
 * Insert a user message block
 */
export function insertUserBlock(
  threadId: string,
  content: string,
  attachments?: AttachmentMetadata[],
  createdAt?: number
): string {
  const id = randomUUID();
  const blockIndex = getNextBlockIndex(threadId);
  db.insert(messageBlocks)
    .values({
      id,
      threadId,
      blockIndex,
      role: "user",
      content,
      attachments: attachments ? JSON.stringify(attachments) : null,
      createdAt: createdAt ?? Date.now(),
    })
    .run();
  return id;
}

/**
 * Insert an assistant message block (starts the streaming block)
 */
export function insertAssistantStartBlock(threadId: string, createdAt?: number): string {
  const id = randomUUID();
  const blockIndex = getNextBlockIndex(threadId);
  db.insert(messageBlocks)
    .values({
      id,
      threadId,
      blockIndex,
      role: "assistant",
      createdAt: createdAt ?? Date.now(),
    })
    .run();
  return id;
}

/**
 * Insert a tool message block (for tool execution tracking)
 */
export function insertToolBlock(
  threadId: string,
  toolCallId: string,
  toolName: string,
  toolArgs: string,
  createdAt?: number
): string {
  const id = randomUUID();
  const blockIndex = getNextBlockIndex(threadId);
  const now = createdAt ?? Date.now();
  db.insert(messageBlocks)
    .values({
      id,
      threadId,
      blockIndex,
      role: "tool",
      toolCallId,
      toolName,
      toolArgs,
      toolStatus: "running",
      toolStartTime: now,
      createdAt: now,
    })
    .run();
  return id;
}

/**
 * Update an assistant block with streaming content deltas
 */
export function updateAssistantBlockContent(
  blockId: string,
  content: string,
  thinking?: string,
  model?: string,
  provider?: string,
  thinkingLevel?: string
): void {
  const updates: Partial<MessageBlock> = { content };
  
  if (thinking !== undefined) updates.thinking = thinking;
  if (model !== undefined) updates.model = model;
  if (provider !== undefined) updates.provider = provider;
  if (thinkingLevel !== undefined) updates.thinkingLevel = thinkingLevel;
  
  const setClause: Record<string, unknown> = {};
  if (updates.content !== undefined) setClause.content = updates.content;
  if (updates.thinking !== undefined) setClause.thinking = updates.thinking;
  if (updates.model !== undefined) setClause.model = updates.model;
  if (updates.provider !== undefined) setClause.provider = updates.provider;
  if (updates.thinkingLevel !== undefined) setClause.thinkingLevel = updates.thinkingLevel;
  
  db.update(messageBlocks)
    .set(setClause)
    .where(eq(messageBlocks.id, blockId))
    .run();
}

/**
 * Append text delta to assistant block content
 */
export function appendAssistantTextDelta(blockId: string, delta: string): void {
  const existing = db
    .select({ content: messageBlocks.content })
    .from(messageBlocks)
    .where(eq(messageBlocks.id, blockId))
    .get();
  
  const newContent = (existing?.content ?? "") + delta;
  db.update(messageBlocks)
    .set({ content: newContent })
    .where(eq(messageBlocks.id, blockId))
    .run();
}

/**
 * Append thinking delta to assistant block
 */
export function appendAssistantThinkingDelta(blockId: string, delta: string): void {
  const existing = db
    .select({ thinking: messageBlocks.thinking })
    .from(messageBlocks)
    .where(eq(messageBlocks.id, blockId))
    .get();
  
  const newThinking = (existing?.thinking ?? "") + delta;
  db.update(messageBlocks)
    .set({ thinking: newThinking })
    .where(eq(messageBlocks.id, blockId))
    .run();
}

/**
 * Finalize an assistant block with metadata
 */
export function finalizeAssistantBlock(
  blockId: string,
  metadata: {
    responseTime?: number;
    model?: string;
    provider?: string;
    thinkingLevel?: string;
    errorMessage?: string;
  }
): void {
  const setClause: Record<string, unknown> = {};
  if (metadata.responseTime !== undefined) setClause.responseTime = metadata.responseTime;
  if (metadata.model !== undefined) setClause.model = metadata.model;
  if (metadata.provider !== undefined) setClause.provider = metadata.provider;
  if (metadata.thinkingLevel !== undefined) setClause.thinkingLevel = metadata.thinkingLevel;
  if (metadata.errorMessage !== undefined) setClause.errorMessage = metadata.errorMessage;
  
  db.update(messageBlocks)
    .set(setClause)
    .where(eq(messageBlocks.id, blockId))
    .run();
}

/**
 * Update a tool block with result
 */
export function updateToolBlockResult(
  blockId: string,
  result: {
    status: "done" | "error";
    result: string;
    duration?: number;
  }
): void {
  const updates: Record<string, unknown> = {
    toolStatus: result.status,
    toolResult: result.result,
  };
  if (result.duration !== undefined) {
    updates.toolDuration = result.duration;
  }
  
  db.update(messageBlocks)
    .set(updates)
    .where(eq(messageBlocks.id, blockId))
    .run();
}

/**
 * Update a tool block with partial result during execution (for progress updates).
 * For example, the write tool can stream file contents as they're being written.
 */
export function updateToolBlockPartialResult(
  blockId: string,
  partialResult: string
): void {
  db.update(messageBlocks)
    .set({ toolResult: partialResult })
    .where(eq(messageBlocks.id, blockId))
    .run();
}

/**
 * Get a message block by ID
 */
export function getMessageBlock(id: string): MessageBlock | undefined {
  return db.select().from(messageBlocks).where(eq(messageBlocks.id, id)).get();
}

/**
 * Delete all message blocks for a thread
 */
export function deleteThreadBlocks(threadId: string): void {
  db.delete(messageBlocks).where(eq(messageBlocks.threadId, threadId)).run();
}

/**
 * Delete all message blocks at or after the given blockIndex (inclusive).
 * Used when reverting the conversation to a specific point.
 */
export function deleteMessageBlocksFrom(threadId: string, fromBlockIndex: number): void {
  db.delete(messageBlocks)
    .where(and(eq(messageBlocks.threadId, threadId), gte(messageBlocks.blockIndex, fromBlockIndex)))
    .run();
}

/**
 * Get block count for a thread
 */
export function getBlockCount(threadId: string): number {
  const result = db
    .select({ count: count() })
    .from(messageBlocks)
    .where(eq(messageBlocks.threadId, threadId))
    .get();
  return result?.count ?? 0;
}

/**
 * Get running tool blocks for a thread.
 * Used to restore tool states on reconnect/reload.
 */
export function listRunningToolBlocks(threadId: string): MessageBlock[] {
  return db
    .select()
    .from(messageBlocks)
    .where(
      and(
        eq(messageBlocks.threadId, threadId),
        eq(messageBlocks.role, "tool"),
        eq(messageBlocks.toolStatus, "running")
      )
    )
    .orderBy(asc(messageBlocks.blockIndex))
    .all()
    .map(toMessageBlock);
}

/**
 * Insert a compaction marker block.
 * This marks the point in conversation history where context compaction occurred.
 */
export function insertCompactionBlock(
  threadId: string,
  reason: "manual" | "threshold" | "overflow",
  createdAt?: number
): string {
  const id = randomUUID();
  const blockIndex = getNextBlockIndex(threadId);
  db.insert(messageBlocks)
    .values({
      id,
      threadId,
      blockIndex,
      role: "compaction",
      content: reason,
      createdAt: createdAt ?? Date.now(),
    })
    .run();
  return id;
}

/**
 * Insert an abort message block.
 * This marks when a user aborted the current agent operation.
 */
export function insertAbortBlock(threadId: string): string {
  const id = randomUUID();
  const blockIndex = getNextBlockIndex(threadId);
  db.insert(messageBlocks)
    .values({
      id,
      threadId,
      blockIndex,
      role: "abort",
      content: null,
      createdAt: Date.now(),
    })
    .run();
  return id;
}
