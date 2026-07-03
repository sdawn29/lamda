import { Hono } from "hono";
import { z } from "zod";
import {
  getWorkspaceTasks,
  createWorkspaceTask,
  updateWorkspaceTask,
  deleteWorkspaceTask,
} from "@lamda/db";
import { parseJsonBody } from "../lib/validate.js";

const tasksRouter = new Hono();

const createTaskSchema = z.object({
  name: z.string().optional(),
  icon: z.string().optional(),
  command: z.string(),
});

const updateTaskSchema = z.object({
  name: z.string().optional(),
  icon: z.string().optional(),
  command: z.string().optional(),
});

tasksRouter.get("/:workspaceId", (c) => {
  const workspaceId = c.req.param("workspaceId");
  const tasks = getWorkspaceTasks(workspaceId);
  return c.json({ tasks });
});

tasksRouter.post("/:workspaceId", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const parsed = await parseJsonBody(c, createTaskSchema);
  if (!parsed.ok) return parsed.response;
  const { name, icon, command } = parsed.data;
  const task = createWorkspaceTask(workspaceId, { name, icon, command });
  return c.json({ task }, 201);
});

tasksRouter.patch("/:workspaceId/:id", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const id = c.req.param("id");
  const parsed = await parseJsonBody(c, updateTaskSchema);
  if (!parsed.ok) return parsed.response;
  updateWorkspaceTask(workspaceId, id, parsed.data);
  return c.json({ success: true });
});

tasksRouter.delete("/:workspaceId/:id", (c) => {
  const workspaceId = c.req.param("workspaceId");
  const id = c.req.param("id");
  deleteWorkspaceTask(workspaceId, id);
  return c.json({ success: true });
});

export { tasksRouter };
