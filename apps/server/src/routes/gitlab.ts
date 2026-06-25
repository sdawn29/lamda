import { Hono } from "hono";
import type { Context } from "hono";
import { GlabError } from "@lamda/gitlab";
import {
  gl,
  sessionCwd,
  workspaceCwd,
  anyRepoCwd,
} from "../services/gitlab-service.js";

const gitlab = new Hono();

function resolveCwd(c: Context): string | null {
  const id = c.req.query("id");
  if (id) return sessionCwd(id);
  const ws = c.req.query("ws");
  if (ws) return workspaceCwd(ws);
  const path = c.req.query("path");
  if (path) return path;
  return null;
}

function resolveCwdFromBody(body: {
  id?: string;
  ws?: string;
  path?: string;
}): string | null {
  if (body.id) return sessionCwd(body.id);
  if (body.ws) return workspaceCwd(body.ws);
  if (body.path) return body.path;
  return null;
}

function glabErrorResponse(c: Context, err: unknown, fallback: string) {
  const message = err instanceof GlabError ? err.message : fallback;
  return c.json({ error: message }, 500);
}

function isMergeRequestState(value: string): value is gl.MergeRequestState {
  return (
    value === "opened" ||
    value === "closed" ||
    value === "merged" ||
    value === "all"
  );
}

function isIssueState(value: string): value is gl.IssueState {
  return value === "opened" || value === "closed" || value === "all";
}

gitlab.get("/gitlab/status", async (c) => {
  const cwd = resolveCwd(c) ?? anyRepoCwd();
  const status = await gl.getGlabStatus(cwd);
  return c.json(status);
});

gitlab.get("/gitlab/repo", async (c) => {
  const cwd = resolveCwd(c);
  if (!cwd) return c.json({ error: "No repo context" }, 400);
  const repo = await gl.getRepoInfo(cwd);
  return c.json({ repo });
});

gitlab.get("/gitlab/repositories", async (c) => {
  const cwd = resolveCwd(c) ?? anyRepoCwd();
  const limitParam = c.req.query("limit");
  const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;
  if (limitParam && !Number.isInteger(limit)) {
    return c.json({ error: "Invalid limit" }, 400);
  }
  const repositories = await gl.listRepositories(cwd, { limit });
  return c.json({ repositories });
});

gitlab.post("/gitlab/repo/publish", async (c) => {
  const body = await c.req.json<{
    id?: string;
    ws?: string;
    path?: string;
    name?: string;
    visibility?: gl.GitlabRepositoryVisibility;
  }>();
  const cwd = resolveCwdFromBody(body);
  if (!cwd) return c.json({ error: "No repo context" }, 400);
  if (
    body.visibility &&
    body.visibility !== "private" &&
    body.visibility !== "public"
  ) {
    return c.json({ error: "Invalid visibility" }, 400);
  }
  try {
    const repo = await gl.publishRepository(cwd, {
      name: body.name,
      visibility: body.visibility,
    });
    return c.json({ repo }, 201);
  } catch (err) {
    return glabErrorResponse(c, err, "Failed to publish repository");
  }
});

gitlab.get("/gitlab/mrs", async (c) => {
  const cwd = resolveCwd(c);
  if (!cwd) return c.json({ error: "No repo context" }, 400);
  const state = c.req.query("state") ?? "opened";
  if (!isMergeRequestState(state)) {
    return c.json({ error: "Invalid merge request state" }, 400);
  }
  try {
    const mrs = await gl.listMergeRequests(cwd, { state });
    return c.json({ mrs });
  } catch (err) {
    return glabErrorResponse(c, err, "Failed to list merge requests");
  }
});

gitlab.post("/gitlab/mrs", async (c) => {
  const body = await c.req.json<{
    id?: string;
    ws?: string;
    path?: string;
    title?: string;
    description?: string;
    targetBranch?: string;
    sourceBranch?: string;
    draft?: boolean;
    removeSourceBranch?: boolean;
  }>();
  const cwd = resolveCwdFromBody(body);
  if (!cwd) return c.json({ error: "No repo context" }, 400);
  if (!body.title?.trim()) return c.json({ error: "title is required" }, 400);
  try {
    const result = await gl.createMergeRequest(cwd, {
      title: body.title,
      description: body.description,
      sourceBranch: body.sourceBranch,
      targetBranch: body.targetBranch,
      draft: body.draft,
      removeSourceBranch: body.removeSourceBranch,
    });
    return c.json(result, 201);
  } catch (err) {
    return glabErrorResponse(c, err, "Failed to create merge request");
  }
});

gitlab.get("/gitlab/issues", async (c) => {
  const cwd = resolveCwd(c);
  if (!cwd) return c.json({ error: "No repo context" }, 400);
  const state = c.req.query("state") ?? "opened";
  if (!isIssueState(state)) {
    return c.json({ error: "Invalid issue state" }, 400);
  }
  try {
    const issues = await gl.listIssues(cwd, { state });
    return c.json({ issues });
  } catch (err) {
    return glabErrorResponse(c, err, "Failed to list issues");
  }
});

export default gitlab;
