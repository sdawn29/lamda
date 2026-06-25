import { Hono } from "hono";
import type { Context } from "hono";
import { GhError } from "@lamda/github";
import { gitPushSetUpstream } from "@lamda/git";
import {
  gh,
  sessionCwd,
  workspaceCwd,
  anyRepoCwd,
} from "../services/github-service.js";

const github = new Hono();

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
  const body = await c.req.json<{
    id?: string;
    ws?: string;
    path?: string;
    name?: string;
    visibility?: gh.GhRepositoryVisibility;
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
    const repo = await gh.publishRepository(cwd, {
      name: body.name,
      visibility: body.visibility,
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
  if (!Number.isInteger(number)) return c.json({ error: "Invalid PR number" }, 400);
  try {
    const pr = await gh.getPullRequest(cwd, number);
    return c.json({ pr });
  } catch (err) {
    return ghErrorResponse(c, err, "Failed to load pull request");
  }
});

github.post("/github/prs", async (c) => {
  const body = await c.req.json<{
    id?: string;
    ws?: string;
    path?: string;
    title?: string;
    body?: string;
    base?: string;
    head?: string;
    draft?: boolean;
    push?: boolean;
  }>();
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
  if (!Number.isInteger(number)) return c.json({ error: "Invalid PR number" }, 400);
  const body = await c.req
    .json<{ id?: string; ws?: string; path?: string; method?: gh.MergeMethod }>()
    .catch(
      () => ({}) as { id?: string; ws?: string; path?: string; method?: gh.MergeMethod },
    );
  const cwd = resolveCwdFromBody(body);
  if (!cwd) return c.json({ error: "No repo context" }, 400);
  try {
    await gh.mergePullRequest(cwd, number, body.method ?? "squash");
    return c.json({ ok: true });
  } catch (err) {
    return ghErrorResponse(c, err, "Failed to merge pull request");
  }
});

github.post("/github/prs/:number/checkout", async (c) => {
  const number = Number.parseInt(c.req.param("number"), 10);
  if (!Number.isInteger(number)) return c.json({ error: "Invalid PR number" }, 400);
  const body = await c.req
    .json<{ id?: string; ws?: string; path?: string }>()
    .catch(() => ({}) as { id?: string; ws?: string; path?: string });
  const cwd = resolveCwdFromBody(body);
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
  if (!Number.isInteger(number)) return c.json({ error: "Invalid issue number" }, 400);
  try {
    const issue = await gh.getIssue(cwd, number);
    return c.json({ issue });
  } catch (err) {
    return ghErrorResponse(c, err, "Failed to load issue");
  }
});

github.post("/github/issues", async (c) => {
  const body = await c.req.json<{
    id?: string;
    ws?: string;
    path?: string;
    title?: string;
    body?: string;
  }>();
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
  if (!Number.isInteger(number)) return c.json({ error: "Invalid issue number" }, 400);
  const body = await c.req.json<{
    id?: string;
    ws?: string;
    path?: string;
    body?: string;
  }>();
  const cwd = resolveCwdFromBody(body);
  if (!cwd) return c.json({ error: "No repo context" }, 400);
  if (!body.body?.trim()) return c.json({ error: "comment body is required" }, 400);
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
