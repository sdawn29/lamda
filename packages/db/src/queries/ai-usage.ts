import { gte, sql, type SQL } from "drizzle-orm";
import { db } from "../client.js";
import { aiUsage, workspaces } from "../schema.js";

export interface AiUsageRecord {
  threadId: string;
  workspaceId: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  cost: number;
}

export interface AiUsageTotals {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  cost: number;
}

export interface AiUsageByModel extends AiUsageTotals {
  provider: string;
  model: string;
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
  totalTokens: number;
  cost: number;
}

export interface AiUsageStats {
  totals: AiUsageTotals;
  byModel: AiUsageByModel[];
  byWorkspace: AiUsageByWorkspace[];
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
  totalTokens: sql<number>`coalesce(sum(${aiUsage.totalTokens}), 0)`,
  cost: sql<number>`coalesce(sum(${aiUsage.cost}), 0)`,
};

function sinceFilter(sinceMs?: number): SQL | undefined {
  return sinceMs && sinceMs > 0 ? gte(aiUsage.createdAt, sinceMs) : undefined;
}

/** Aggregated usage stats, optionally limited to rows recorded at/after sinceMs. */
export function getAiUsageStats(sinceMs?: number): AiUsageStats {
  const where = sinceFilter(sinceMs);

  const totals = db
    .select(totalsColumns)
    .from(aiUsage)
    .where(where)
    .get() ?? {
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: 0,
    cost: 0,
  };

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
      totalTokens: totalsColumns.totalTokens,
      cost: totalsColumns.cost,
    })
    .from(aiUsage)
    .where(where)
    .groupBy(dayExpr)
    .orderBy(dayExpr)
    .all();

  return { totals, byModel, byWorkspace, daily };
}
