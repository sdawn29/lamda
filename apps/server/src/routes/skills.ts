/**
 * Skills registry routes — search skills.sh and manage skills installed into
 * lamda's global `~/.lamda/skills` directory (shared across every workspace).
 */

import { Hono } from "hono";
import {
  getInstallJobs,
  getPopularSkills,
  getSkillDetails,
  listInstalledSkills,
  removeInstalledSkill,
  searchSkillsRegistry,
  startSkillInstall,
} from "../services/skills-registry-service.js";

const skillsRouter = new Hono();

/** GET /skills/search?q=... — query the skills.sh registry. */
skillsRouter.get("/search", async (c) => {
  const q = c.req.query("q") ?? "";
  try {
    const skills = await searchSkillsRegistry(q);
    return c.json({ skills });
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "Search failed" },
      502,
    );
  }
});

/** GET /skills/popular — best-effort "most installed" skills (see service). */
skillsRouter.get("/popular", async (c) => {
  try {
    const skills = await getPopularSkills();
    return c.json({ skills });
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "Failed to load popular skills" },
      502,
    );
  }
});

/** GET /skills/details?source=owner/repo/skillId — preview without installing. */
skillsRouter.get("/details", async (c) => {
  const source = c.req.query("source") ?? "";
  try {
    const details = await getSkillDetails(source);
    if (!details) return c.json({ error: "Skill not found." }, 404);
    return c.json({ details });
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "Failed to load skill details" },
      502,
    );
  }
});

/** GET /skills/installed — skills currently in ~/.lamda/skills. */
skillsRouter.get("/installed", (c) => {
  return c.json({ skills: listInstalledSkills() });
});

/**
 * POST /skills/install { source }
 *
 * Kicks off `npx skills add <source>`, landing the result in
 * ~/.lamda/skills. Returns 202 with the job; the client polls GET
 * /skills/install for progress.
 */
skillsRouter.post("/install", async (c) => {
  const body = await c.req.json<{ source?: string }>().catch(() => null);
  const source = body?.source;
  if (!source || typeof source !== "string") {
    return c.json({ error: "Missing 'source'." }, 400);
  }
  const job = startSkillInstall(source);
  return c.json({ job }, 202);
});

/** GET /skills/install — all install jobs (running and finished). */
skillsRouter.get("/install", (c) => {
  return c.json({ jobs: getInstallJobs() });
});

/** DELETE /skills/:name — remove an installed skill. */
skillsRouter.delete("/:name", (c) => {
  const name = c.req.param("name");
  const result = removeInstalledSkill(name);
  if (!result.success) return c.json({ error: result.error }, 400);
  return c.json({ success: true });
});

export { skillsRouter };
