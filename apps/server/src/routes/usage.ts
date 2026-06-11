import { Hono } from "hono";
import { getAiUsageStats } from "@lamda/db";

const usage = new Hono();

/**
 * Aggregated AI token/cost usage. `?days=N` limits to the last N days;
 * omit or pass 0 for all-time.
 */
usage.get("/usage", (c) => {
  const daysParam = c.req.query("days");
  const days = daysParam ? Number(daysParam) : 0;
  if (!Number.isFinite(days) || days < 0) {
    return c.json({ error: "days must be a non-negative number" }, 400);
  }
  const sinceMs = days > 0 ? Date.now() - days * 24 * 60 * 60 * 1000 : undefined;
  return c.json(getAiUsageStats(sinceMs));
});

export default usage;
