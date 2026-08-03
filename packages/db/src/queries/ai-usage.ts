import {
  and,
  eq,
  gte,
  isNotNull,
  isNull,
  lte,
  sql,
  type SQL,
} from "drizzle-orm";
import { db } from "../client.js";
import { aiUsage, workspaces } from "../schema.js";

export interface AiUsageRecord {
  threadId: string;
  workspaceId: string;
  provider: string;
  model: string;
  /**
   * Null for the thread's own (main-agent) usage; a subagent's agent id
   * (e.g. "explore") for usage recorded by a `delegate`-tool run.
   */
  agentId: string | null;
  /** Display-name snapshot of the agent at insert time; null alongside agentId. */
  agentLabel: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** Reasoning/thinking tokens reported by the provider — a subset of outputTokens. */
  reasoningTokens: number;
  totalTokens: number;
  cost: number;
}

export interface AiUsageTotals {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** Reasoning/thinking tokens reported by the provider — a subset of outputTokens. */
  reasoningTokens: number;
  totalTokens: number;
  cost: number;
}

export interface AiUsageByModel extends AiUsageTotals {
  provider: string;
  model: string;
}

export interface AiUsageByAgent extends AiUsageTotals {
  /** Null for the thread-owner's own usage; a subagent's agent id otherwise. */
  agentId: string | null;
  /** Representative display label for agentId (most recently recorded). */
  agentLabel: string | null;
}

export interface AiUsageByWorkspace extends AiUsageTotals {
  workspaceId: string;
  workspaceName: string | null;
  threads: number;
  models: AiUsageByModel[];
}

export interface AiUsageDaily {
  /** Local-time day in YYYY-MM-DD format. */
  day: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  cost: number;
}

export interface AiUsageStats {
  totals: AiUsageTotals;
  byModel: AiUsageByModel[];
  byWorkspace: AiUsageByWorkspace[];
  byAgent: AiUsageByAgent[];
  daily: AiUsageDaily[];
}

export function insertAiUsage(record: AiUsageRecord): void {
  db.insert(aiUsage)
    .values({ ...record, createdAt: Date.now() })
    .run();
}

const totalsColumns = {
  requests: sql<number>`count(*)`,
  inputTokens: sql<number>`coalesce(sum(${aiUsage.inputTokens}), 0)`,
  outputTokens: sql<number>`coalesce(sum(${aiUsage.outputTokens}), 0)`,
  cacheReadTokens: sql<number>`coalesce(sum(${aiUsage.cacheReadTokens}), 0)`,
  cacheWriteTokens: sql<number>`coalesce(sum(${aiUsage.cacheWriteTokens}), 0)`,
  reasoningTokens: sql<number>`coalesce(sum(${aiUsage.reasoningTokens}), 0)`,
  totalTokens: sql<number>`coalesce(sum(${aiUsage.totalTokens}), 0)`,
  cost: sql<number>`coalesce(sum(${aiUsage.cost}), 0)`,
};

function rangeFilter(sinceMs?: number, untilMs?: number): SQL | undefined {
  const filters: SQL[] = [];
  if (sinceMs && sinceMs > 0) filters.push(gte(aiUsage.createdAt, sinceMs));
  if (untilMs && untilMs > 0) filters.push(lte(aiUsage.createdAt, untilMs));
  return filters.length > 0 ? and(...filters) : undefined;
}

function zeroTotals(): AiUsageTotals {
  return {
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    cost: 0,
  };
}

/** Aggregated usage stats, optionally limited to rows recorded within [sinceMs, untilMs]. */
export function getAiUsageStats(
  sinceMs?: number,
  untilMs?: number,
): AiUsageStats {
  const where = rangeFilter(sinceMs, untilMs);

  const totals =
    db.select(totalsColumns).from(aiUsage).where(where).get() ?? zeroTotals();

  const byAgent = db
    .select({
      agentId: aiUsage.agentId,
      // Representative label for this agentId — a custom agent renamed since
      // its last run would otherwise mix labels across grouped rows.
      agentLabel: sql<string | null>`max(${aiUsage.agentLabel})`,
      ...totalsColumns,
    })
    .from(aiUsage)
    .where(where)
    .groupBy(aiUsage.agentId)
    .orderBy(sql`sum(${aiUsage.totalTokens}) desc`)
    .all();

  const byModel = db
    .select({
      provider: aiUsage.provider,
      model: aiUsage.model,
      ...totalsColumns,
    })
    .from(aiUsage)
    .where(where)
    .groupBy(aiUsage.provider, aiUsage.model)
    .orderBy(sql`sum(${aiUsage.totalTokens}) desc`)
    .all();

  const workspaceRows = db
    .select({
      workspaceId: aiUsage.workspaceId,
      workspaceName: sql<string | null>`${workspaces.name}`,
      threads: sql<number>`count(distinct ${aiUsage.threadId})`,
      ...totalsColumns,
    })
    .from(aiUsage)
    .leftJoin(workspaces, sql`${workspaces.id} = ${aiUsage.workspaceId}`)
    .where(where)
    .groupBy(aiUsage.workspaceId)
    .orderBy(sql`sum(${aiUsage.totalTokens}) desc`)
    .all();

  const workspaceModelRows = db
    .select({
      workspaceId: aiUsage.workspaceId,
      provider: aiUsage.provider,
      model: aiUsage.model,
      ...totalsColumns,
    })
    .from(aiUsage)
    .where(where)
    .groupBy(aiUsage.workspaceId, aiUsage.provider, aiUsage.model)
    .orderBy(sql`sum(${aiUsage.totalTokens}) desc`)
    .all();

  const byWorkspace: AiUsageByWorkspace[] = workspaceRows.map((ws) => ({
    ...ws,
    models: workspaceModelRows
      .filter((row) => row.workspaceId === ws.workspaceId)
      .map(({ workspaceId: _ignored, ...model }) => model),
  }));

  // unixepoch milliseconds → local-time day bucket
  const dayExpr = sql<string>`date(${aiUsage.createdAt} / 1000, 'unixepoch', 'localtime')`;
  const daily = db
    .select({
      day: dayExpr,
      inputTokens: totalsColumns.inputTokens,
      outputTokens: totalsColumns.outputTokens,
      cacheReadTokens: totalsColumns.cacheReadTokens,
      cacheWriteTokens: totalsColumns.cacheWriteTokens,
      reasoningTokens: totalsColumns.reasoningTokens,
      totalTokens: totalsColumns.totalTokens,
      cost: totalsColumns.cost,
    })
    .from(aiUsage)
    .where(where)
    .groupBy(dayExpr)
    .orderBy(dayExpr)
    .all();

  return { totals, byModel, byWorkspace, byAgent, daily };
}

/**
 * One thread's usage split into its own (main-agent) turns vs everything
 * recorded by subagents it spawned — used by the chat UI's context popup,
 * which otherwise only sees the live session's own token accounting (the
 * SDK's `getSessionStats()` has no visibility into a nested subagent's
 * separate session object).
 */
export interface ThreadAiUsageBreakdown {
  main: AiUsageTotals;
  subagents: AiUsageTotals;
}

export function getThreadAiUsageBreakdown(
  threadId: string,
): ThreadAiUsageBreakdown {
  const main =
    db
      .select(totalsColumns)
      .from(aiUsage)
      .where(and(eq(aiUsage.threadId, threadId), isNull(aiUsage.agentId)))
      .get() ?? zeroTotals();
  const subagents =
    db
      .select(totalsColumns)
      .from(aiUsage)
      .where(and(eq(aiUsage.threadId, threadId), isNotNull(aiUsage.agentId)))
      .get() ?? zeroTotals();
  return { main, subagents };
}
