import { Hono } from "hono";
import { promises as fs } from "node:fs";
import { join } from "node:path";
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
  gitFetch,
  gitPull,
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
  getAheadBehind,
  gitLog,
  gitShow,
  gitShowFiles,
  gitShowFileDiff,
  gitRestoreFileFromRef,
} from "@lamda/git";
import { generateCommitMessage } from "@lamda/pi-sdk";
import { listAgentTurnsBySession, getAgentTurnFiles, getAgentTurnsFromId, deleteAgentTurnsFrom } from "@lamda/db";
import { store } from "../store.js";
import { gitCwd } from "../services/session-service.js";
import { sessionEvents } from "../session-events.js";

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
  try {
    return c.json({ raw: await gitStatus(cwd), isGitRepo: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("not a git repository")) {
      return c.json({ raw: "", isGitRepo: false });
    }
    return c.json({ error: parseGitError(err, "Git status failed") }, 500);
  }
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

git.post("/session/:id/git/fetch", async (c) => {
  const cwd = gitCwd(c.req.param("id"));
  if (!cwd) return c.json({ error: "Session not found" }, 404);
  try {
    await gitFetch(cwd);
    return new Response(null, { status: 204 });
  } catch (err) {
    return c.json({ error: parseGitError(err, "Fetch failed") }, 500);
  }
});

git.post("/session/:id/git/pull", async (c) => {
  const cwd = gitCwd(c.req.param("id"));
  if (!cwd) return c.json({ error: "Session not found" }, 404);
  try {
    await gitPull(cwd);
    return new Response(null, { status: 204 });
  } catch (err) {
    return c.json({ error: parseGitError(err, "Pull failed") }, 500);
  }
});

git.get("/session/:id/git/ahead-behind", async (c) => {
  const cwd = gitCwd(c.req.param("id"));
  if (!cwd) return c.json({ ahead: null, behind: null });
  const result = await getAheadBehind(cwd);
  return c.json(result ?? { ahead: null, behind: null });
});

git.get("/session/:id/git/log", async (c) => {
  const cwd = gitCwd(c.req.param("id"));
  if (!cwd) return c.json({ entries: [] });
  const limitParam = c.req.query("limit");
  const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 50, 200) : 50;
  const raw = await gitLog(cwd, limit);
  const entries = raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [sha, shortSha, author, date, ...subjectParts] = line.split("|");
      return { sha, shortSha, author, date, subject: subjectParts.join("|") };
    });
  return c.json({ entries });
});

git.get("/session/:id/git/show", async (c) => {
  const cwd = gitCwd(c.req.param("id"));
  if (!cwd) return c.json({ error: "Session not found" }, 404);
  const sha = c.req.query("sha");
  if (!sha) return c.json({ error: "sha query param is required" }, 400);
  return c.json({ diff: await gitShow(cwd, sha) });
});

git.get("/session/:id/git/show-files", async (c) => {
  const cwd = gitCwd(c.req.param("id"));
  if (!cwd) return c.json({ error: "Session not found" }, 404);
  const sha = c.req.query("sha");
  if (!sha) return c.json({ error: "sha query param is required" }, 400);
  return c.json({ files: await gitShowFiles(cwd, sha) });
});

git.get("/session/:id/git/show-file-diff", async (c) => {
  const cwd = gitCwd(c.req.param("id"));
  if (!cwd) return c.json({ error: "Session not found" }, 404);
  const sha = c.req.query("sha");
  const file = c.req.query("file");
  if (!sha) return c.json({ error: "sha query param is required" }, 400);
  if (!file) return c.json({ error: "file query param is required" }, 400);
  return c.json({ diff: await gitShowFileDiff(cwd, sha, file) });
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

// ── Turn checkpoints (multi-turn history) ─────────────────────────────────────

// List all recorded turns for this session, newest first.
git.get("/session/:id/git/turns", (c) => {
  const id = c.req.param("id");

  // Merge in-progress turn files from the live hub so the UI can see the
  // current turn's changes before it completes and lands in the DB.
  // currentTurnStartTime is reset to 0 once the post-turn capture writes the
  // turn to the DB, so it's the authoritative signal for "a turn is running."
  // Without this guard, lastTurnFiles still contains the just-completed turn's
  // files and we'd emit a phantom live turn alongside its DB counterpart.
  const currentTurnStartTime = sessionEvents.getCurrentTurnStartTime(id);
  const liveFiles = currentTurnStartTime > 0 ? sessionEvents.getLastTurnFiles(id) : [];
  const turns = listAgentTurnsBySession(id);

  const liveTurn = liveFiles.length > 0
    ? [{
        id: 0,
        sessionId: id,
        threadId: "",
        startedAt: currentTurnStartTime,
        endedAt: 0,
        checkpointSha: "",
        files: liveFiles.map((f) => ({
          filePath: f.filePath,
          postStatusCode: f.postStatusCode,
          wasCreatedByTurn: f.wasCreatedByTurn,
        })),
        inProgress: true,
      }]
    : [];

  return c.json({
    turns: [
      ...liveTurn,
      ...turns.map((t) => ({ ...t, inProgress: false })),
    ],
  });
});

// Get detailed file list (with pre-content) for a specific completed turn.
git.get("/session/:id/git/turns/:turnId/files", (c) => {
  const id = c.req.param("id");
  const turnIdParam = c.req.param("turnId");

  // turnId=0 means the live in-progress turn
  if (turnIdParam === "0") {
    const files = sessionEvents.getLastTurnFiles(id).map((f) => ({
      filePath: f.filePath,
      postStatusCode: f.postStatusCode,
      preStatusCode: f.preStatusCode,
      wasCreatedByTurn: f.wasCreatedByTurn,
      preContent: f.preContent ?? null,
    }));
    return c.json({ files });
  }

  const turnId = parseInt(turnIdParam, 10);
  if (isNaN(turnId)) return c.json({ error: "Invalid turnId" }, 400);

  const files = getAgentTurnFiles(turnId);
  return c.json({ files });
});

// Revert the working tree to the state before a given turn.
// Uses the git stash checkpoint if available; falls back to per-file content restore.
git.post("/session/:id/git/turns/:turnId/revert", async (c) => {
  const id = c.req.param("id");
  const cwd = gitCwd(id);
  if (!cwd) return c.json({ error: "Session not found" }, 404);

  const turnIdParam = c.req.param("turnId");
  const errors: string[] = [];

  // turnId=0 → revert the in-progress / most-recent turn using in-memory data
  if (turnIdParam === "0") {
    const files = sessionEvents.getLastTurnFiles(id);
    if (!files.length) return c.json({ error: "No current turn to revert" }, 404);

    for (const file of files) {
      const fullPath = join(cwd, file.filePath);
      try {
        if (file.wasCreatedByTurn) {
          await fs.unlink(fullPath).catch(() => {});
          await gitUnstage(cwd, file.filePath).catch(() => {});
        } else if (file.preContent !== null) {
          await fs.writeFile(fullPath, file.preContent, "utf8");
          await gitUnstage(cwd, file.filePath).catch(() => {});
        } else {
          await gitRevertFile(cwd, file.filePath, file.postStatusCode).catch((err) => {
            errors.push(`${file.filePath}: ${err instanceof Error ? err.message : String(err)}`);
          });
        }
      } catch (err) {
        errors.push(`${file.filePath}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (errors.length > 0) {
      return c.json({ error: `Some files could not be reverted: ${errors.join("; ")}` }, 500);
    }
    sessionEvents.clearLastTurnFiles(id);
    return new Response(null, { status: 204 });
  }

  const turnId = parseInt(turnIdParam, 10);
  if (isNaN(turnId)) return c.json({ error: "Invalid turnId" }, 400);

  // Collect this turn and all subsequent turns (sorted oldest first).
  const turnsToRevert = getAgentTurnsFromId(id, turnId);
  if (!turnsToRevert.length) return c.json({ error: "Turn not found" }, 404);

  // For each file, the target state is the preContent of the EARLIEST turn that
  // touched it — that represents the state before any of these turns ran.
  const fileTargetMap = new Map<string, ReturnType<typeof getAgentTurnFiles>[number]>();
  const earliestCheckpointSha = turnsToRevert[0]?.checkpointSha ?? "";

  for (const turn of turnsToRevert) {
    const files = getAgentTurnFiles(turn.id);
    for (const file of files) {
      if (!fileTargetMap.has(file.filePath)) {
        fileTargetMap.set(file.filePath, file);
      }
    }
  }

  if (fileTargetMap.size === 0) return c.json({ error: "Turn has no file changes to revert" }, 404);

  for (const [, file] of fileTargetMap) {
    const fullPath = join(cwd, file.filePath);
    try {
      if (file.wasCreatedByTurn) {
        await fs.unlink(fullPath).catch(() => {});
        await gitUnstage(cwd, file.filePath).catch(() => {});
      } else if (earliestCheckpointSha) {
        // Restore from the pre-turn stash checkpoint of the earliest turn being reverted.
        await gitRestoreFileFromRef(cwd, earliestCheckpointSha, file.filePath).catch(async () => {
          if (file.preContent !== null) {
            await fs.writeFile(fullPath, file.preContent, "utf8");
            await gitUnstage(cwd, file.filePath).catch(() => {});
          } else {
            await gitRevertFile(cwd, file.filePath, file.postStatusCode).catch((err) => {
              errors.push(`${file.filePath}: ${err instanceof Error ? err.message : String(err)}`);
            });
          }
        });
      } else if (file.preContent !== null) {
        await fs.writeFile(fullPath, file.preContent, "utf8");
        await gitUnstage(cwd, file.filePath).catch(() => {});
      } else {
        await gitRevertFile(cwd, file.filePath, file.postStatusCode).catch((err) => {
          errors.push(`${file.filePath}: ${err instanceof Error ? err.message : String(err)}`);
        });
      }
    } catch (err) {
      errors.push(`${file.filePath}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (errors.length > 0) {
    return c.json({ error: `Some files could not be reverted: ${errors.join("; ")}` }, 500);
  }

  // Remove this turn and all subsequent turns from the DB so they disappear from the sidebar.
  deleteAgentTurnsFrom(id, turnId);

  return new Response(null, { status: 204 });
});

export default git;
