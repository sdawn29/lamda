import { Hono } from "hono"
import {
  getWorkspaceTasks,
  createWorkspaceTask,
  updateWorkspaceTask,
  deleteWorkspaceTask,
} from "@lamda/db"

const tasksRouter = new Hono()

tasksRouter.get("/:workspaceId", (c) => {
  const workspaceId = c.req.param("workspaceId")
  const tasks = getWorkspaceTasks(workspaceId)
  return c.json({ tasks })
})

tasksRouter.post("/:workspaceId", async (c) => {
  const workspaceId = c.req.param("workspaceId")
  const { icon, command } = await c.req.json<{ icon?: string; command: string }>()
  const task = createWorkspaceTask(workspaceId, { icon, command })
  return c.json({ task }, 201)
})

tasksRouter.patch("/:workspaceId/:id", async (c) => {
  const workspaceId = c.req.param("workspaceId")
  const id = c.req.param("id")
  const updates = await c.req.json<{ icon?: string; command?: string }>()
  updateWorkspaceTask(workspaceId, id, updates)
  return c.json({ success: true })
})

tasksRouter.delete("/:workspaceId/:id", (c) => {
  const workspaceId = c.req.param("workspaceId")
  const id = c.req.param("id")
  deleteWorkspaceTask(workspaceId, id)
  return c.json({ success: true })
})

export { tasksRouter }
