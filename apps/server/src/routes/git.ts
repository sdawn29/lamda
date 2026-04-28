import { Hono } from "hono";
import {
  getCurrentBranch,
  initGitRepo,
  gitClone,
  listBranches,
  checkoutBranch,
  createBranch,
  gitStatus,
  gitFileDiff,
  gitCommit,
  gitPush,
  gitStage,
  gitUnstage,
  gitStageAll,
  gitUnstageAll,
  gitStash,
  gitStashList,
  gitStashPop,
  gitStashApply,
  gitStashDrop,
  gitDiffStat,
  gitRevertFile,
  gitStagedDiff,
} from "@lamda/git";
import { generateCommitMessage } from "@lamda/pi-sdk";
import { store } from "../store.js";
import { gitCwd } from "../services/session-service.js";

const git = new Hono();

function parseGitError(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : String(err);
  const lines = raw.split("\n").filter(Boolean);
  return (
    lines.find((l) => l.startsWith("error:") || l.startsWith("fatal:")) ??
    lines[0] ??
    fallback
  );
}

// ── Clone repository ────────────────────────────────────────────────────────────

git.post("/git/clone", async (c) => {
  const body = await c.req.json<{ url?: string; path?: string }>();
  if (!body.url || !body.path)
    return c.json({ error: "url and path are required" }, 400);
  try {
    await gitClone(body.url, body.path);
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: parseGitError(err, "Clone failed") }, 500);
  }
});

// ── Branch management ─────────────────────────────────────────────────────────

git.get("/session/:id/branch", async (c) => {
  const cwd = store.getCwd(c.req.param("id"));
  if (!cwd) return c.json({ branch: null });
  return c.json({ branch: await getCurrentBranch(cwd) });
});

git.get("/session/:id/branches", async (c) => {
  const cwd = store.getCwd(c.req.param("id"));
  if (!cwd) return c.json({ branches: [] });
  return c.json({ branches: await listBranches(cwd) });
});

git.post("/session/:id/checkout", async (c) => {
  const cwd = store.getCwd(c.req.param("id"));
  if (!cwd) return c.json({ error: "Session not found" }, 404);
  const body = await c.req.json<{ branch: string }>();
  if (!body.branch) return c.json({ error: "branch is required" }, 400);
  try {
    await checkoutBranch(cwd, body.branch);
    return c.json({ branch: await getCurrentBranch(cwd) });
  } catch (err) {
    return c.json({ error: parseGitError(err, "Checkout failed") }, 500);
  }
});

git.post("/session/:id/branch", async (c) => {
  const cwd = store.getCwd(c.req.param("id"));
  if (!cwd) return c.json({ error: "Session not found" }, 404);
  const body = await c.req.json<{ branch: string }>();
  if (!body.branch) return c.json({ error: "branch is required" }, 400);
  try {
    await createBranch(cwd, body.branch);
    return c.json({ branch: await getCurrentBranch(cwd) });
  } catch (err) {
    return c.json({ error: parseGitError(err, "Branch creation failed") }, 500);
  }
});

// ── Git operations ─────────────────────────────────────────────────────────────

git.post("/session/:id/git/init", async (c) => {
  const cwd = gitCwd(c.req.param("id"));
  if (!cwd) return c.json({ error: "Session not found" }, 404);
  try {
    await initGitRepo(cwd);
    return c.json({
      branch: await getCurrentBranch(cwd),
      branches: await listBranches(cwd),
    });
  } catch (err) {
    return c.json({ error: parseGitError(err, "Repository initialization failed") }, 500);
  }
});

git.get("/session/:id/git/status", async (c) => {
  const cwd = gitCwd(c.req.param("id"));
  if (!cwd) return c.json({ error: "Session not found" }, 404);
  return c.json({ raw: await gitStatus(cwd) });
});

git.get("/session/:id/git/diff-stat", async (c) => {
  const cwd = gitCwd(c.req.param("id"));
  if (!cwd) return c.json({ error: "Session not found" }, 404);
  return c.json(await gitDiffStat(cwd));
});

git.get("/session/:id/git/diff", async (c) => {
  const cwd = gitCwd(c.req.param("id"));
  if (!cwd) return c.json({ error: "Session not found" }, 404);
  const file = c.req.query("file");
  const status = c.req.query("status") ?? "";
  if (!file) return c.json({ error: "file query param is required" }, 400);
  try {
    return c.json({ diff: await gitFileDiff(cwd, file, status) });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

git.post("/session/:id/git/commit", async (c) => {
  const cwd = gitCwd(c.req.param("id"));
  if (!cwd) return c.json({ error: "Session not found" }, 404);
  const body = await c.req.json<{ message?: string }>();
  if (!body.message) return c.json({ error: "message is required" }, 400);
  try {
    return c.json({ output: await gitCommit(cwd, body.message) });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

git.post("/session/:id/git/generate-commit-message", async (c) => {
  const cwd = gitCwd(c.req.param("id"));
  if (!cwd) return c.json({ error: "Session not found" }, 404);
  const body = await c.req
    .json<{ promptTemplate?: string }>()
    .catch((): { promptTemplate?: string } => ({}));
  const diff = await gitStagedDiff(cwd);
  if (!diff.trim()) return c.json({ error: "No staged changes to generate a message for" }, 400);
  return c.json({ message: await generateCommitMessage(diff, { cwd }, body.promptTemplate) });
});

git.post("/session/:id/git/push", async (c) => {
  const cwd = gitCwd(c.req.param("id"));
  if (!cwd) return c.json({ error: "Session not found" }, 404);
  try {
    await gitPush(cwd);
    return new Response(null, { status: 204 });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

git.post("/session/:id/git/stage", async (c) => {
  const cwd = gitCwd(c.req.param("id"));
  if (!cwd) return c.json({ error: "Session not found" }, 404);
  const body = await c.req.json<{ filePath?: string }>();
  if (!body.filePath) return c.json({ error: "filePath is required" }, 400);
  await gitStage(cwd, body.filePath);
  return new Response(null, { status: 204 });
});

git.post("/session/:id/git/unstage", async (c) => {
  const cwd = gitCwd(c.req.param("id"));
  if (!cwd) return c.json({ error: "Session not found" }, 404);
  const body = await c.req.json<{ filePath?: string }>();
  if (!body.filePath) return c.json({ error: "filePath is required" }, 400);
  await gitUnstage(cwd, body.filePath);
  return new Response(null, { status: 204 });
});

git.post("/session/:id/git/stage-all", async (c) => {
  const cwd = gitCwd(c.req.param("id"));
  if (!cwd) return c.json({ error: "Session not found" }, 404);
  await gitStageAll(cwd);
  return new Response(null, { status: 204 });
});

git.post("/session/:id/git/unstage-all", async (c) => {
  const cwd = gitCwd(c.req.param("id"));
  if (!cwd) return c.json({ error: "Session not found" }, 404);
  await gitUnstageAll(cwd);
  return new Response(null, { status: 204 });
});

git.post("/session/:id/git/revert-file", async (c) => {
  const cwd = gitCwd(c.req.param("id"));
  if (!cwd) return c.json({ error: "Session not found" }, 404);
  const body = await c.req.json<{ filePath?: string; raw?: string }>();
  if (!body.filePath || body.raw === undefined)
    return c.json({ error: "filePath and raw are required" }, 400);
  await gitRevertFile(cwd, body.filePath, body.raw);
  return new Response(null, { status: 204 });
});

git.post("/session/:id/git/stash", async (c) => {
  const cwd = gitCwd(c.req.param("id"));
  if (!cwd) return c.json({ error: "Session not found" }, 404);
  const body = await c.req
    .json<{ message?: string }>()
    .catch((): { message?: string } => ({}));
  await gitStash(cwd, body.message);
  return new Response(null, { status: 204 });
});

git.get("/session/:id/git/stash-list", async (c) => {
  const cwd = gitCwd(c.req.param("id"));
  if (!cwd) return c.json({ error: "Session not found" }, 404);
  return c.json({ raw: await gitStashList(cwd) });
});

git.post("/session/:id/git/stash-pop", async (c) => {
  const cwd = gitCwd(c.req.param("id"));
  if (!cwd) return c.json({ error: "Session not found" }, 404);
  const body = await c.req.json<{ ref?: string }>();
  if (!body.ref) return c.json({ error: "ref is required" }, 400);
  try {
    await gitStashPop(cwd, body.ref);
    return new Response(null, { status: 204 });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

git.post("/session/:id/git/stash-apply", async (c) => {
  const cwd = gitCwd(c.req.param("id"));
  if (!cwd) return c.json({ error: "Session not found" }, 404);
  const body = await c.req.json<{ ref?: string }>();
  if (!body.ref) return c.json({ error: "ref is required" }, 400);
  try {
    await gitStashApply(cwd, body.ref);
    return new Response(null, { status: 204 });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

git.post("/session/:id/git/stash-drop", async (c) => {
  const cwd = gitCwd(c.req.param("id"));
  if (!cwd) return c.json({ error: "Session not found" }, 404);
  const body = await c.req.json<{ ref?: string }>();
  if (!body.ref) return c.json({ error: "ref is required" }, 400);
  try {
    await gitStashDrop(cwd, body.ref);
    return new Response(null, { status: 204 });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

export default git;
