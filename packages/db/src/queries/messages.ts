import { randomUUID } from "node:crypto";
import { eq, asc } from "drizzle-orm";
import { db } from "../client.js";
import { messages } from "../schema.js";

export interface StoredMessage {
  id: string;
  threadId: string;
  role: "user" | "assistant" | "tool";
  content: string;
  createdAt: number;
}

export function listMessages(threadId: string): StoredMessage[] {
  return db
    .select()
    .from(messages)
    .where(eq(messages.threadId, threadId))
    .orderBy(asc(messages.createdAt))
    .all() as StoredMessage[];
}

export function insertMessage(
  threadId: string,
  role: "user" | "assistant" | "tool",
  content: string,
): string {
  const id = randomUUID();
  db.insert(messages)
    .values({ id, threadId, role, content, createdAt: Date.now() })
    .run();
  return id;
}
