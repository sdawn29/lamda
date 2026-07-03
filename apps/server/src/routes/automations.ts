import { Hono } from "hono";
import { z } from "zod";
import {
  getAutomations,
  getAllAutomations,
  getAutomation,
  getAutomationRuns,
  createAutomation,
  updateAutomation,
  deleteAutomation,
  getWorkspace,
  type AutomationApprovalMode,
  type CreateAutomationInput,
} from "@lamda/db";
import {
  registerAutomation,
  rescheduleAutomation,
  unregisterAutomation,
  isValidCron,
} from "../services/automation-scheduler.js";
import { runAutomation } from "../services/automation-runner.js";
import { automationBroadcaster } from "../automation-broadcaster.js";
import { parseJsonBody } from "../lib/validate.js";

const automationsRouter = new Hono();

const APPROVAL_MODES: AutomationApprovalMode[] = [
  "ask",
  "edits_allowed",
  "all_allowed",
];

const automationBodySchema = z.object({
  name: z.string().optional(),
  prompt: z.string().optional(),
  cron: z.string().optional(),
  modelId: z.string().nullable().optional(),
  mode: z.string().optional(),
  // Kept as a plain string here (not a zod enum) — invalid values are
  // rejected below by isApprovalMode so the existing "invalid approvalMode"
  // error message is preserved rather than a generic zod one.
  approvalMode: z.string().optional(),
  useWorktree: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

function isApprovalMode(value: unknown): value is AutomationApprovalMode {
  return (
    typeof value === "string" &&
    APPROVAL_MODES.includes(value as AutomationApprovalMode)
  );
}

// List every automation across all workspaces.
automationsRouter.get("/", (c) => {
  return c.json({ automations: getAllAutomations() });
});

// List automations for a single workspace.
automationsRouter.get("/:workspaceId", (c) => {
  const workspaceId = c.req.param("workspaceId");
  return c.json({ automations: getAutomations(workspaceId) });
});

// Run history for a single automation (newest first).
automationsRouter.get("/:id/runs", (c) => {
  const id = c.req.param("id");
  if (!getAutomation(id)) return c.json({ error: "Not found" }, 404);
  return c.json({ runs: getAutomationRuns(id) });
});

// Create an automation.
automationsRouter.post("/:workspaceId", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  if (!getWorkspace(workspaceId)) {
    return c.json({ error: "Workspace not found" }, 404);
  }
  const parsed = await parseJsonBody(c, automationBodySchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  if (!body.name?.trim()) return c.json({ error: "name is required" }, 400);
  if (!body.prompt?.trim()) return c.json({ error: "prompt is required" }, 400);
  if (!body.cron?.trim() || !isValidCron(body.cron)) {
    return c.json({ error: "a valid cron expression is required" }, 400);
  }
  if (body.approvalMode !== undefined && !isApprovalMode(body.approvalMode)) {
    return c.json({ error: "invalid approvalMode" }, 400);
  }

  const input: CreateAutomationInput = {
    name: body.name.trim(),
    prompt: body.prompt.trim(),
    cron: body.cron.trim(),
    modelId: body.modelId ?? null,
    mode: body.mode,
    approvalMode: body.approvalMode as AutomationApprovalMode | undefined,
    useWorktree: body.useWorktree,
    enabled: body.enabled,
  };
  const automation = createAutomation(workspaceId, input);
  if (automation.enabled) registerAutomation(automation.id, automation.cron);
  automationBroadcaster.broadcast();
  return c.json({ automation }, 201);
});

// Update an automation, then reconcile its scheduled job.
automationsRouter.patch("/:id", async (c) => {
  const id = c.req.param("id");
  if (!getAutomation(id)) return c.json({ error: "Not found" }, 404);
  const parsed = await parseJsonBody(c, automationBodySchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  if (body.cron !== undefined && !isValidCron(body.cron)) {
    return c.json({ error: "invalid cron expression" }, 400);
  }
  if (body.approvalMode !== undefined && !isApprovalMode(body.approvalMode)) {
    return c.json({ error: "invalid approvalMode" }, 400);
  }

  updateAutomation(id, {
    name: body.name?.trim(),
    prompt: body.prompt?.trim(),
    cron: body.cron?.trim(),
    modelId: body.modelId,
    mode: body.mode,
    approvalMode: body.approvalMode as AutomationApprovalMode | undefined,
    useWorktree: body.useWorktree,
    enabled: body.enabled,
  });
  rescheduleAutomation(id);
  automationBroadcaster.broadcast();
  return c.json({ automation: getAutomation(id) });
});

automationsRouter.delete("/:id", (c) => {
  const id = c.req.param("id");
  if (!getAutomation(id)) return c.json({ error: "Not found" }, 404);
  unregisterAutomation(id);
  deleteAutomation(id);
  automationBroadcaster.broadcast();
  return c.json({ success: true });
});

// Run an automation immediately (manual trigger / test). Fire-and-forget: an
// agent turn can far exceed an HTTP timeout, so return 202 right away and let
// the client observe progress by refetching the automation + its run history.
automationsRouter.post("/:id/run", (c) => {
  const id = c.req.param("id");
  if (!getAutomation(id)) return c.json({ error: "Not found" }, 404);
  runAutomation(id, "manual").catch((err: unknown) => {
    console.error(`[automation:${id}] manual run failed`, err);
  });
  return c.json({ accepted: true }, 202);
});

export { automationsRouter };
