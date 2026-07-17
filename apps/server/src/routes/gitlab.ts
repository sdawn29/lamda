import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { GlabError } from "@lamda/gitlab";
import {
  gl,
  sessionCwd,
  workspaceCwd,
  anyRepoCwd,
} from "../services/gitlab-service.js";
import { parseJsonBody } from "../lib/validate.js";

const gitlab = new Hono();

const repoContextSchema = z.object({
  id: z.string().optional(),
  ws: z.string().optional(),
  path: z.string().optional(),
});

const publishRepoSchema = repoContextSchema.extend({
  name: z.string().optional(),
  visibility: z.string().optional(),
});

const createMrSchema = repoContextSchema.extend({
  title: z.string().optional(),
  description: z.string().optional(),
  targetBranch: z.string().optional(),
  sourceBranch: z.string().optional(),
  draft: z.boolean().optional(),
  removeSourceBranch: z.boolean().optional(),
});

const commentMrSchema = repoContextSchema.extend({
  body: z.string().optional(),
});

const mergeMrSchema = repoContextSchema.extend({
  squash: z.boolean().optional(),
  auto: z.boolean().optional(),
});

const reviewCommentSchema = repoContextSchema.extend({
  body: z.string().trim().min(1),
  baseSha: z.string().min(1),
  startSha: z.string().min(1),
  headSha: z.string().min(1),
  path: z.string().min(1),
  previousPath: z.string().min(1).optional(),
  side: z.enum(["LEFT", "RIGHT"]),
  line: z.number().int().positive(),
  oldLine: z.number().int().positive().optional(),
  newLine: z.number().int().positive().optional(),
});

const reviewReplySchema = repoContextSchema.extend({
  body: z.string().trim().min(1),
});

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
  const parsed = await parseJsonBody(c, publishRepoSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const cwd = resolveCwdFromBody(body);
  if (!cwd) return c.json({ error: "No repo context" }, 400);
  if (
    body.visibility &&
    body.visibility !== "private" &&
    body.visibility !== "public"
  ) {
    return c.json({ error: "Invalid visibility" }, 400);
  }
  const visibility = body.visibility as
    | gl.GitlabRepositoryVisibility
    | undefined;
  try {
    const repo = await gl.publishRepository(cwd, {
      name: body.name,
      visibility,
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

gitlab.get("/gitlab/pipeline", async (c) => {
  const cwd = resolveCwd(c);
  if (!cwd) return c.json({ error: "No repo context" }, 400);
  try {
    const pipeline = await gl.getPipeline(cwd, { ref: c.req.query("ref") });
    return c.json({ pipeline });
  } catch (err) {
    return glabErrorResponse(c, err, "Failed to load pipeline");
  }
});

gitlab.get("/gitlab/mrs/:number", async (c) => {
  const cwd = resolveCwd(c);
  if (!cwd) return c.json({ error: "No repo context" }, 400);
  const number = Number.parseInt(c.req.param("number"), 10);
  if (!Number.isInteger(number)) {
    return c.json({ error: "Invalid merge request number" }, 400);
  }
  try {
    const mr = await gl.getMergeRequest(cwd, number);
    return c.json({ mr });
  } catch (err) {
    return glabErrorResponse(c, err, "Failed to load merge request");
  }
});

gitlab.get("/gitlab/mrs/:number/review", async (c) => {
  const cwd = resolveCwd(c);
  if (!cwd) return c.json({ error: "No repo context" }, 400);
  const number = Number.parseInt(c.req.param("number"), 10);
  if (!Number.isInteger(number)) {
    return c.json({ error: "Invalid merge request number" }, 400);
  }
  try {
    const review = await gl.getMergeRequestReview(cwd, number);
    return c.json({ review });
  } catch (err) {
    return glabErrorResponse(c, err, "Failed to load merge request changes");
  }
});

gitlab.get("/gitlab/commits/:oid/diff", async (c) => {
  const cwd = resolveCwd(c);
  if (!cwd) return c.json({ error: "No repo context" }, 400);
  const oid = c.req.param("oid");
  try {
    const files = await gl.getCommitDiff(cwd, oid);
    return c.json({ files });
  } catch (err) {
    return glabErrorResponse(c, err, "Failed to load commit diff");
  }
});

gitlab.post("/gitlab/mrs/:number/review-comments", async (c) => {
  const number = Number.parseInt(c.req.param("number"), 10);
  if (!Number.isInteger(number)) {
    return c.json({ error: "Invalid merge request number" }, 400);
  }
  const parsed = await parseJsonBody(c, reviewCommentSchema);
  if (!parsed.ok) return parsed.response;
  const cwd = resolveCwdFromBody(parsed.data);
  if (!cwd) return c.json({ error: "No repo context" }, 400);
  try {
    const comment = await gl.createMergeRequestReviewComment(
      cwd,
      number,
      parsed.data,
    );
    return c.json({ comment }, 201);
  } catch (err) {
    return glabErrorResponse(c, err, "Failed to add review comment");
  }
});

gitlab.post(
  "/gitlab/mrs/:number/discussions/:discussionId/replies",
  async (c) => {
    const number = Number.parseInt(c.req.param("number"), 10);
    if (!Number.isInteger(number)) {
      return c.json({ error: "Invalid merge request number" }, 400);
    }
    const parsed = await parseJsonBody(c, reviewReplySchema);
    if (!parsed.ok) return parsed.response;
    const cwd = resolveCwdFromBody(parsed.data);
    if (!cwd) return c.json({ error: "No repo context" }, 400);
    try {
      const comment = await gl.replyToMergeRequestReviewComment(
        cwd,
        number,
        c.req.param("discussionId"),
        parsed.data.body,
      );
      return c.json({ comment }, 201);
    } catch (err) {
      return glabErrorResponse(c, err, "Failed to reply to review comment");
    }
  },
);

gitlab.post("/gitlab/mrs", async (c) => {
  const parsed = await parseJsonBody(c, createMrSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
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

gitlab.post("/gitlab/mrs/:number/comment", async (c) => {
  const number = Number.parseInt(c.req.param("number"), 10);
  if (!Number.isInteger(number)) {
    return c.json({ error: "Invalid merge request number" }, 400);
  }
  const parsed = await parseJsonBody(c, commentMrSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const cwd = resolveCwdFromBody(body);
  if (!cwd) return c.json({ error: "No repo context" }, 400);
  if (!body.body?.trim()) {
    return c.json({ error: "comment body is required" }, 400);
  }
  try {
    await gl.commentMergeRequest(cwd, number, body.body);
    return c.json({ ok: true });
  } catch (err) {
    return glabErrorResponse(c, err, "Failed to add comment");
  }
});

gitlab.post("/gitlab/mrs/:number/checkout", async (c) => {
  const number = Number.parseInt(c.req.param("number"), 10);
  if (!Number.isInteger(number)) {
    return c.json({ error: "Invalid merge request number" }, 400);
  }
  const parsed = await parseJsonBody(c, repoContextSchema);
  if (!parsed.ok) return parsed.response;
  const cwd = resolveCwdFromBody(parsed.data);
  if (!cwd) return c.json({ error: "No repo context" }, 400);
  try {
    await gl.checkoutMergeRequest(cwd, number);
    return c.json({ ok: true });
  } catch (err) {
    return glabErrorResponse(c, err, "Failed to check out merge request");
  }
});

gitlab.post("/gitlab/mrs/:number/merge", async (c) => {
  const number = Number.parseInt(c.req.param("number"), 10);
  if (!Number.isInteger(number)) {
    return c.json({ error: "Invalid merge request number" }, 400);
  }
  const parsed = await parseJsonBody(c, mergeMrSchema);
  if (!parsed.ok) return parsed.response;
  const cwd = resolveCwdFromBody(parsed.data);
  if (!cwd) return c.json({ error: "No repo context" }, 400);
  try {
    await gl.mergeMergeRequest(
      cwd,
      number,
      parsed.data.squash ?? false,
      parsed.data.auto ?? false,
    );
    return c.json({ ok: true });
  } catch (err) {
    return glabErrorResponse(c, err, "Failed to merge merge request");
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
