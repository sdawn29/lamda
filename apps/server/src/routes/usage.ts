import { Hono } from "hono";
import { getAiUsageStats } from "@lamda/db";

const usage = new Hono();

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Aggregated AI token/cost usage.
 *
 * Filters (mutually exclusive, `from`/`to` win over `days`):
 * - `?from=YYYY-MM-DD&to=YYYY-MM-DD` — inclusive local-time date range; either
 *   bound may be omitted for an open-ended range.
 * - `?days=N` — the last N days; omit or pass 0 for all-time.
 */
usage.get("/usage", (c) => {
  const from = c.req.query("from");
  const to = c.req.query("to");

  if (from || to) {
    if ((from && !DAY_RE.test(from)) || (to && !DAY_RE.test(to))) {
      return c.json({ error: "from/to must be YYYY-MM-DD dates" }, 400);
    }
    // Interpret bounds in the server's local timezone, matching the
    // local-time day bucketing used by the daily aggregation.
    const sinceMs = from ? new Date(`${from}T00:00:00`).getTime() : undefined;
    const untilMs = to ? new Date(`${to}T23:59:59.999`).getTime() : undefined;
    if ((sinceMs !== undefined && Number.isNaN(sinceMs)) ||
        (untilMs !== undefined && Number.isNaN(untilMs))) {
      return c.json({ error: "from/to must be valid dates" }, 400);
    }
    return c.json(getAiUsageStats(sinceMs, untilMs));
  }

  const daysParam = c.req.query("days");
  const days = daysParam ? Number(daysParam) : 0;
  if (!Number.isFinite(days) || days < 0) {
    return c.json({ error: "days must be a non-negative number" }, 400);
  }
  const sinceMs = days > 0 ? Date.now() - days * 24 * 60 * 60 * 1000 : undefined;
  return c.json(getAiUsageStats(sinceMs));
});

export default usage;
