import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { GhError } from "@lamda/github";
import { gitPushSetUpstream } from "@lamda/git";
import {
  gh,
  sessionCwd,
  workspaceCwd,
  anyRepoCwd,
} from "../services/github-service.js";
import { parseJsonBody } from "../lib/validate.js";

const github = new Hono();

const repoContextSchema = z.object({
  id: z.string().optional(),
  ws: z.string().optional(),
  path: z.string().optional(),
});

const publishRepoSchema = repoContextSchema.extend({
  name: z.string().optional(),
  visibility: z.string().optional(),
});

const createPrSchema = repoContextSchema.extend({
  title: z.string().optional(),
  body: z.string().optional(),
  base: z.string().optional(),
  head: z.string().optional(),
  draft: z.boolean().optional(),
  push: z.boolean().optional(),
});

const mergePrSchema = repoContextSchema.extend({
  method: z.string().optional(),
  auto: z.boolean().optional(),
});

const createIssueSchema = repoContextSchema.extend({
  title: z.string().optional(),
  body: z.string().optional(),
});

const commentIssueSchema = repoContextSchema.extend({
  body: z.string().optional(),
});

const reviewCommentSchema = repoContextSchema.extend({
  body: z.string().min(1),
  commitId: z.string().min(1),
  path: z.string().min(1),
  side: z.enum(["LEFT", "RIGHT"]),
  line: z.number().int().positive(),
});

const reviewReplySchema = repoContextSchema.extend({
  body: z.string().trim().min(1),
});

/**
 * Resolves the repo directory for a request. Callers pass one of:
 *   ?id=<sessionId>   live session (worktree or workspace) — preferred
 *   ?ws=<workspaceId> a workspace, when no session is active
 *   ?path=<dir>       an explicit directory
 */
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

function ghErrorResponse(c: Context, err: unknown, fallback: string) {
  const message = err instanceof GhError ? err.message : fallback;
  return c.json({ error: message }, 500);
}

// ── Status ────────────────────────────────────────────────────────────────────

github.get("/github/status", async (c) => {
  // Auth is global to gh, so any real directory works.
  const cwd = resolveCwd(c) ?? anyRepoCwd();
  const status = await gh.getGhStatus(cwd);
  return c.json(status);
});

github.get("/github/repo", async (c) => {
  const cwd = resolveCwd(c);
  if (!cwd) return c.json({ error: "No repo context" }, 400);
  const repo = await gh.getRepoInfo(cwd);
  return c.json({ repo });
});

github.get("/github/repositories", async (c) => {
  const cwd = resolveCwd(c) ?? anyRepoCwd();
  const limitParam = c.req.query("limit");
  const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;
  if (limitParam && !Number.isInteger(limit)) {
    return c.json({ error: "Invalid limit" }, 400);
  }
  const repositories = await gh.listRepositories(cwd, { limit });
  return c.json({ repositories });
});

github.post("/github/repo/publish", async (c) => {
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
  const visibility = body.visibility as gh.GhRepositoryVisibility | undefined;
  try {
    const repo = await gh.publishRepository(cwd, {
      name: body.name,
      visibility,
    });
    return c.json({ repo }, 201);
  } catch (err) {
    return ghErrorResponse(c, err, "Failed to publish repository");
  }
});

// ── Pull requests ─────────────────────────────────────────────────────────────

github.get("/github/prs", async (c) => {
  const cwd = resolveCwd(c);
  if (!cwd) return c.json({ error: "No repo context" }, 400);
  const state = (c.req.query("state") ?? "open") as gh.PrState;
  try {
    const prs = await gh.listPullRequests(cwd, { state });
    return c.json({ prs });
  } catch (err) {
    return ghErrorResponse(c, err, "Failed to list pull requests");
  }
});

github.get("/github/prs/:number", async (c) => {
  const cwd = resolveCwd(c);
  if (!cwd) return c.json({ error: "No repo context" }, 400);
  const number = Number.parseInt(c.req.param("number"), 10);
  if (!Number.isInteger(number))
    return c.json({ error: "Invalid PR number" }, 400);
  try {
    const pr = await gh.getPullRequest(cwd, number);
    return c.json({ pr });
  } catch (err) {
    return ghErrorResponse(c, err, "Failed to load pull request");
  }
});

github.get("/github/prs/:number/review", async (c) => {
  const cwd = resolveCwd(c);
  if (!cwd) return c.json({ error: "No repo context" }, 400);
  const number = Number.parseInt(c.req.param("number"), 10);
  if (!Number.isInteger(number))
    return c.json({ error: "Invalid PR number" }, 400);
  try {
    const review = await gh.getPullRequestReview(cwd, number);
    return c.json({ review });
  } catch (err) {
    return ghErrorResponse(c, err, "Failed to load pull request changes");
  }
});

github.get("/github/commits/:oid/diff", async (c) => {
  const cwd = resolveCwd(c);
  if (!cwd) return c.json({ error: "No repo context" }, 400);
  const oid = c.req.param("oid");
  try {
    const files = await gh.getCommitDiff(cwd, oid);
    return c.json({ files });
  } catch (err) {
    return ghErrorResponse(c, err, "Failed to load commit diff");
  }
});

github.post("/github/prs/:number/review-comments", async (c) => {
  const number = Number.parseInt(c.req.param("number"), 10);
  if (!Number.isInteger(number))
    return c.json({ error: "Invalid PR number" }, 400);
  const parsed = await parseJsonBody(c, reviewCommentSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const cwd = resolveCwdFromBody(body);
  if (!cwd) return c.json({ error: "No repo context" }, 400);
  try {
    const comment = await gh.createPullRequestReviewComment(cwd, number, {
      body: body.body,
      commitId: body.commitId,
      path: body.path,
      side: body.side,
      line: body.line,
    });
    return c.json({ comment }, 201);
  } catch (err) {
    return ghErrorResponse(c, err, "Failed to add review comment");
  }
});

github.post(
  "/github/prs/:number/review-comments/:commentId/replies",
  async (c) => {
    const number = Number.parseInt(c.req.param("number"), 10);
    const commentId = Number.parseInt(c.req.param("commentId"), 10);
    if (!Number.isInteger(number) || !Number.isInteger(commentId))
      return c.json({ error: "Invalid PR or review comment number" }, 400);
    const parsed = await parseJsonBody(c, reviewReplySchema);
    if (!parsed.ok) return parsed.response;
    const cwd = resolveCwdFromBody(parsed.data);
    if (!cwd) return c.json({ error: "No repo context" }, 400);
    try {
      const comment = await gh.replyToPullRequestReviewComment(
        cwd,
        number,
        commentId,
        parsed.data.body,
      );
      return c.json({ comment }, 201);
    } catch (err) {
      return ghErrorResponse(c, err, "Failed to reply to review comment");
    }
  },
);

github.post("/github/prs", async (c) => {
  const parsed = await parseJsonBody(c, createPrSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const cwd = resolveCwdFromBody(body);
  if (!cwd) return c.json({ error: "No repo context" }, 400);
  if (!body.title?.trim()) return c.json({ error: "title is required" }, 400);
  try {
    // Worktree/feature branches usually have no upstream yet; push first (unless
    // the caller opts out) so `gh pr create` has a remote head to open against.
    if (body.push !== false) {
      try {
        await gitPushSetUpstream(cwd);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to push branch";
        return c.json({ error: `Could not push branch: ${message}` }, 500);
      }
    }
    const result = await gh.createPullRequest(cwd, {
      title: body.title,
      body: body.body,
      base: body.base,
      head: body.head,
      draft: body.draft,
    });
    return c.json(result, 201);
  } catch (err) {
    return ghErrorResponse(c, err, "Failed to create pull request");
  }
});

github.post("/github/prs/:number/merge", async (c) => {
  const number = Number.parseInt(c.req.param("number"), 10);
  if (!Number.isInteger(number))
    return c.json({ error: "Invalid PR number" }, 400);
  const parsed = await parseJsonBody(c, mergePrSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const cwd = resolveCwdFromBody(body);
  if (!cwd) return c.json({ error: "No repo context" }, 400);
  try {
    const method = body.method as gh.MergeMethod | undefined;
    await gh.mergePullRequest(
      cwd,
      number,
      method ?? "squash",
      body.auto ?? false,
    );
    return c.json({ ok: true });
  } catch (err) {
    return ghErrorResponse(c, err, "Failed to merge pull request");
  }
});

github.post("/github/prs/:number/checkout", async (c) => {
  const number = Number.parseInt(c.req.param("number"), 10);
  if (!Number.isInteger(number))
    return c.json({ error: "Invalid PR number" }, 400);
  const parsed = await parseJsonBody(c, repoContextSchema);
  if (!parsed.ok) return parsed.response;
  const cwd = resolveCwdFromBody(parsed.data);
  if (!cwd) return c.json({ error: "No repo context" }, 400);
  try {
    await gh.checkoutPullRequest(cwd, number);
    return c.json({ ok: true });
  } catch (err) {
    return ghErrorResponse(c, err, "Failed to check out pull request");
  }
});

// ── Issues ────────────────────────────────────────────────────────────────────

github.get("/github/issues", async (c) => {
  const cwd = resolveCwd(c);
  if (!cwd) return c.json({ error: "No repo context" }, 400);
  const state = (c.req.query("state") ?? "open") as gh.IssueState;
  const search = c.req.query("q") ?? undefined;
  try {
    const issues = await gh.listIssues(cwd, { state, search });
    return c.json({ issues });
  } catch (err) {
    return ghErrorResponse(c, err, "Failed to list issues");
  }
});

github.get("/github/issues/:number", async (c) => {
  const cwd = resolveCwd(c);
  if (!cwd) return c.json({ error: "No repo context" }, 400);
  const number = Number.parseInt(c.req.param("number"), 10);
  if (!Number.isInteger(number))
    return c.json({ error: "Invalid issue number" }, 400);
  try {
    const issue = await gh.getIssue(cwd, number);
    return c.json({ issue });
  } catch (err) {
    return ghErrorResponse(c, err, "Failed to load issue");
  }
});

github.post("/github/issues", async (c) => {
  const parsed = await parseJsonBody(c, createIssueSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const cwd = resolveCwdFromBody(body);
  if (!cwd) return c.json({ error: "No repo context" }, 400);
  if (!body.title?.trim()) return c.json({ error: "title is required" }, 400);
  try {
    const result = await gh.createIssue(cwd, {
      title: body.title,
      body: body.body,
    });
    return c.json(result, 201);
  } catch (err) {
    return ghErrorResponse(c, err, "Failed to create issue");
  }
});

github.post("/github/issues/:number/comment", async (c) => {
  const number = Number.parseInt(c.req.param("number"), 10);
  if (!Number.isInteger(number))
    return c.json({ error: "Invalid issue number" }, 400);
  const parsed = await parseJsonBody(c, commentIssueSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const cwd = resolveCwdFromBody(body);
  if (!cwd) return c.json({ error: "No repo context" }, 400);
  if (!body.body?.trim())
    return c.json({ error: "comment body is required" }, 400);
  try {
    await gh.commentIssue(cwd, number, body.body);
    return c.json({ ok: true });
  } catch (err) {
    return ghErrorResponse(c, err, "Failed to add comment");
  }
});

// ── Checks / CI ───────────────────────────────────────────────────────────────

github.get("/github/checks", async (c) => {
  const cwd = resolveCwd(c);
  if (!cwd) return c.json({ error: "No repo context" }, 400);
  const prParam = c.req.query("pr");
  const ref = c.req.query("ref") ?? undefined;
  const pr = prParam ? Number.parseInt(prParam, 10) : undefined;
  try {
    const checks = await gh.getChecks(cwd, {
      pr: Number.isInteger(pr) ? pr : undefined,
      ref,
    });
    return c.json({ checks });
  } catch (err) {
    return ghErrorResponse(c, err, "Failed to load checks");
  }
});

export default github;
