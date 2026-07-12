/**
 * Skills registry — search the public skills.sh registry and install skills
 * into lamda's global skills directory (`~/.lamda/skills`), so they're
 * available to every workspace (see `additionalSkillPaths` in @lamda/pi-sdk).
 *
 * Installs shell out to the official `skills` CLI (`npx skills@latest add`)
 * rather than re-implementing its source resolution (GitHub tree API, repo
 * cloning, frontmatter parsing, well-known-skill catalogs, …). The CLI is run
 * with its working directory set to a scratch temp dir so it performs its
 * normal *local* (non-global) install into `<tempDir>/.pi/skills/<name>`; the
 * resulting directory is then moved into `~/.lamda/skills/<name>`. This keeps
 * lamda's skills directory independent of the CLI's per-agent global dirs
 * (e.g. `~/.pi/agent/skills`), none of which is `~/.lamda/skills`.
 */

import { spawn } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { createCliEnv } from "@lamda/cli-env";
import { lamdaGlobalSkillsDir } from "@lamda/pi-sdk";

const SEARCH_API_BASE = "https://skills.sh";
const INSTALL_TIMEOUT_MS = 5 * 60 * 1000;
const OUTPUT_CAP = 8 * 1024;

/**
 * The `skills` CLI is an interactive terminal tool — its stdout/stderr is
 * full of ANSI escapes (spinner redraws, its ASCII banner, colored boxes).
 * Reduce that to the handful of plain-text lines that actually explain what
 * happened, suitable for a toast description rather than a terminal.
 */
function cleanCliOutput(raw: string): string {
  const plain = raw.replace(
    // eslint-disable-next-line no-control-regex -- stripping ANSI/control codes requires matching them
    /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][\s\S]*?(?:\x07|\x1b\\)|[\x00-\x08\x0b-\x1f]/g,
    "",
  );
  const lines = plain
    .split("\n")
    .map((l) => l.replace(/^[\s│◇◆●○■├╭╰─]+/, "").trim())
    .filter(Boolean);
  // Prefer the line that actually names the problem (the CLI's error lines
  // all start this way) over whatever happens to be last — e.g. "No matching
  // skills found for: X" is followed by a whole "Available skills:" dump.
  const errorLine = lines.find((l) => /^(no |error|✗|failed)/i.test(l));
  if (errorLine) return errorLine.slice(0, 400);
  return lines.slice(-2).join(" — ").slice(0, 400);
}

export interface SkillSearchResult {
  /** "owner/repo/skillId" — pass straight back as the install source. */
  id: string;
  name: string;
  /** "owner/repo" */
  source: string;
  installs?: number;
}

export interface InstalledSkill {
  /** Directory name under ~/.lamda/skills. */
  name: string;
  description: string;
  updatedAt: number;
  /** Registry id ("owner/repo/skillId") it was installed from, when known. */
  source?: string;
}

export interface SkillDetailFile {
  path: string;
  size: number;
}

export interface SkillDetails {
  /** Registry id ("owner/repo/skillId") this was fetched for. */
  source: string;
  name: string;
  description: string;
  /** SKILL.md body (markdown, frontmatter stripped). */
  body: string;
  files: SkillDetailFile[];
  /**
   * skills.sh's content hash for this download (stable across repeat
   * fetches, changes when the skill's files change). Not a semver — it's
   * the only version-ish signal the registry exposes — but it's enough to
   * detect "the registry has something different than what's installed".
   * Used internally for update detection; see `getSkillUpdates`.
   */
  hash?: string;
}

export async function searchSkillsRegistry(
  query: string,
): Promise<SkillSearchResult[]> {
  if (query.trim().length < 2) return [];
  const url = `${SEARCH_API_BASE}/api/search?q=${encodeURIComponent(query)}&limit=20`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`skills.sh search failed: ${res.status}`);
  const body = (await res.json()) as {
    skills: Array<{
      id: string;
      skillId: string;
      name: string;
      installs?: number;
      source?: string;
    }>;
  };
  return body.skills.map((s) => ({
    id: s.id,
    name: s.name,
    source: s.source ?? "",
    installs: s.installs,
  }));
}

// ─── Popular skills ─────────────────────────────────────────────────────────
//
// skills.sh has no "browse all" / "trending" endpoint — only search. The CLI
// itself works the same way (search, then sort the results by `installs`
// client-side). So "popular" here is a best-effort proxy: fan out a handful
// of broad seed queries, merge the unique results, and sort by install count.
// Cached briefly so opening the page repeatedly doesn't refetch every time.

const POPULAR_SEED_QUERIES = [
  "skill",
  "agent",
  "code",
  "design",
  "git",
  "review",
];
const POPULAR_CACHE_TTL_MS = 15 * 60 * 1000;
let popularCache: { at: number; skills: SkillSearchResult[] } | null = null;

export async function getPopularSkills(
  limit = 12,
): Promise<SkillSearchResult[]> {
  if (popularCache && Date.now() - popularCache.at < POPULAR_CACHE_TTL_MS) {
    return popularCache.skills.slice(0, limit);
  }
  const batches = await Promise.allSettled(
    POPULAR_SEED_QUERIES.map((q) => searchSkillsRegistry(q)),
  );
  const byId = new Map<string, SkillSearchResult>();
  for (const batch of batches) {
    if (batch.status !== "fulfilled") continue;
    for (const skill of batch.value) {
      const existing = byId.get(skill.id);
      if (!existing || (skill.installs ?? 0) > (existing.installs ?? 0)) {
        byId.set(skill.id, skill);
      }
    }
  }
  const merged = Array.from(byId.values()).sort(
    (a, b) => (b.installs ?? 0) - (a.installs ?? 0),
  );
  popularCache = { at: Date.now(), skills: merged };
  return merged.slice(0, limit);
}

/** Parses a SKILL.md's frontmatter (`name`/`description`) and body. */
function parseSkillMd(raw: string): {
  name?: string;
  description?: string;
  body: string;
} {
  const text = raw.replace(/^﻿/, "");
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) return { body: text.trim() };
  const fm: { name?: string; description?: string } = {};
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line
      .slice(idx + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (key === "name") fm.name = value;
    else if (key === "description") fm.description = value;
  }
  return { ...fm, body: text.slice(match[0].length).trim() };
}

/** Minimal frontmatter read — only `name`/`description` are needed here. */
function readSkillFrontmatter(skillMdPath: string): {
  name?: string;
  description?: string;
} {
  let raw: string;
  try {
    raw = readFileSync(skillMdPath, "utf8");
  } catch {
    return {};
  }
  return parseSkillMd(raw);
}

// ─── Install-source manifest ────────────────────────────────────────────────
//
// The skills CLI / SKILL.md frontmatter carries no record of where a skill
// came from, so lamda keeps a tiny sidecar manifest mapping installed skill
// name → registry source. It's the only way the detail page can be revisited
// (e.g. after an app restart) for a skill installed in an earlier session.
// Lives alongside the skill directories but is ignored by the SDK's skill
// loader, which only looks at `.md` files and SKILL.md-containing dirs.

const MANIFEST_FILENAME = ".install-manifest.json";

interface InstallManifest {
  [name: string]: {
    source: string;
    installedAt: number;
    /**
     * The registry's content hash (see `SkillDetails.hash`) captured at
     * install time, when available. The baseline `getSkillUpdates` diffs
     * against — skills installed before this existed have no hash and are
     * simply skipped by update checks rather than guessed at.
     */
    hash?: string;
  };
}

function readManifest(): InstallManifest {
  const path = join(lamdaGlobalSkillsDir(), MANIFEST_FILENAME);
  try {
    return JSON.parse(readFileSync(path, "utf8")) as InstallManifest;
  } catch {
    return {};
  }
}

function writeManifest(manifest: InstallManifest): void {
  const path = join(lamdaGlobalSkillsDir(), MANIFEST_FILENAME);
  try {
    writeFileSync(path, JSON.stringify(manifest, null, 2));
  } catch {
    // Best-effort — losing the source mapping only disables the detail-page
    // deep link for this skill, never the skill itself.
  }
}

function recordInstallSource(
  name: string,
  source: string,
  hash?: string,
): void {
  const manifest = readManifest();
  manifest[name] = { source, installedAt: Date.now(), hash };
  writeManifest(manifest);
}

function forgetInstallSource(name: string): void {
  const manifest = readManifest();
  if (!(name in manifest)) return;
  delete manifest[name];
  writeManifest(manifest);
}

export function listInstalledSkills(): InstalledSkill[] {
  const dir = lamdaGlobalSkillsDir();
  if (!existsSync(dir)) return [];
  const manifest = readManifest();
  const results: InstalledSkill[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillMd = join(dir, entry.name, "SKILL.md");
    if (!existsSync(skillMd)) continue;
    const fm = readSkillFrontmatter(skillMd);
    results.push({
      name: entry.name,
      description: fm.description ?? "",
      updatedAt: statSync(skillMd).mtimeMs,
      source: manifest[entry.name]?.source,
    });
  }
  return results.sort((a, b) => b.updatedAt - a.updatedAt);
}

// ─── Skill details ──────────────────────────────────────────────────────────

const detailsCache = new Map<string, { at: number; details: SkillDetails }>();
const DETAILS_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Fetches a skill's SKILL.md (description + body) and file manifest from
 * skills.sh's download API, without installing anything — used for the
 * detail/preview page. Works for any owner/repo, not just the trusted
 * owners the CLI fast-paths for install (this is a read-only preview, so the
 * extra trust bar for running install scripts doesn't apply).
 */
export async function getSkillDetails(
  source: string,
): Promise<SkillDetails | null> {
  if (!/^[\w.-]+\/[\w.-]+\/[\w.:-]+$/.test(source)) return null;

  const cached = detailsCache.get(source);
  if (cached && Date.now() - cached.at < DETAILS_CACHE_TTL_MS) {
    return cached.details;
  }

  const [owner, repo, ...rest] = source.split("/");
  const skillId = rest.join("/");
  const url = `${SEARCH_API_BASE}/api/download/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(skillId)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) return null;
  const body = (await res.json()) as {
    files: Array<{ path: string; contents: string }>;
    hash?: string;
  };

  const skillMdFile = body.files.find(
    (f) => f.path.toLowerCase() === "skill.md",
  );
  if (!skillMdFile) return null;
  const parsed = parseSkillMd(skillMdFile.contents);

  const details: SkillDetails = {
    source,
    name: parsed.name ?? skillId,
    description: parsed.description ?? "",
    body: parsed.body,
    hash: body.hash,
    files: body.files.map((f) => ({
      path: f.path,
      size: Buffer.byteLength(f.contents, "utf8"),
    })),
  };
  detailsCache.set(source, { at: Date.now(), details });
  return details;
}

// ─── Update detection ───────────────────────────────────────────────────────
//
// skills.sh has no version/semver field and no "updatedAt" on search or
// download responses (verified against the live API) — the only version-ish
// signal it exposes is the content `hash` on a download response, which is
// stable across repeat fetches and changes when the skill's files change.
// So "has an update" is defined as: the registry's current hash for this
// skill's source differs from the hash recorded at install time. Skills
// installed before this existed (or installed from a bare "owner/repo"
// source, which `getSkillDetails` can't resolve) have no baseline hash and
// are skipped rather than guessed at.
//
// Cached per skill for an hour, independent of `detailsCache`'s 5-minute
// TTL, so the skills page can be reopened repeatedly without re-hitting the
// registry more than once an hour per installed skill.

const UPDATE_CACHE_TTL_MS = 60 * 60 * 1000;
const updateCache = new Map<string, { at: number; hasUpdate: boolean }>();

/** Names of installed skills whose registry source has changed since install. */
export async function getSkillUpdates(): Promise<string[]> {
  const manifest = readManifest();
  const candidates = Object.entries(manifest).filter(
    ([, m]) => m.source && m.hash,
  );

  const results = await Promise.allSettled(
    candidates.map(async ([name, m]) => {
      // The baseline hash is part of the key so a successful update (which
      // rewrites the manifest hash) is automatically a cache miss — no stale
      // "update available" served for up to an hour after updating.
      const cacheKey = `${name}:${m.source}:${m.hash}`;
      const cached = updateCache.get(cacheKey);
      if (cached && Date.now() - cached.at < UPDATE_CACHE_TTL_MS) {
        return cached.hasUpdate ? name : null;
      }
      const details = await getSkillDetails(m.source);
      const hasUpdate = !!details?.hash && details.hash !== m.hash;
      updateCache.set(cacheKey, { at: Date.now(), hasUpdate });
      return hasUpdate ? name : null;
    }),
  );

  return results.flatMap((r) =>
    r.status === "fulfilled" && r.value ? [r.value] : [],
  );
}

/** True only when `child` resolves to a direct descendant of `base`. */
function isPathSafe(base: string, child: string): boolean {
  const resolvedBase = resolve(base);
  const resolvedChild = resolve(child);
  return (
    resolvedChild === resolvedBase ||
    resolvedChild.startsWith(resolvedBase + sep)
  );
}

async function installSkillFromRegistry(
  source: string,
): Promise<
  { success: true; skill: InstalledSkill } | { success: false; error: string }
> {
  // Registry ids look like "owner/repo/skillId" (and bare "owner/repo" also
  // resolves to every skill in that repo) — reject anything else so it can't
  // be used to smuggle CLI flags into the spawned argv.
  if (!/^[\w.-]+\/[\w.-]+(\/[\w.:-]+)?$/.test(source)) {
    return { success: false, error: "Invalid skill source." };
  }

  // The CLI's positional "owner/repo/<rest>" shorthand treats <rest> as a
  // literal subpath from the repo root — it does NOT mean "the skill named
  // <rest>". Most registry skills don't live at exactly `<repo>/<skillId>/`
  // (many nest under a `skills/` folder, etc.), so passing the registry's
  // 3-segment id straight through as the source makes the clone-based
  // discovery fall back to "No skills found" for anything outside the CLI's
  // small blob-fast-path owner allowlist. Splitting it into a plain
  // "owner/repo" source plus `--skill <name>` instead makes the CLI discover
  // every skill in the repo first, then filter by name — which works
  // regardless of where the skill actually lives in the tree.
  const [owner, repo, ...rest] = source.split("/");
  const repoSource = `${owner}/${repo}`;
  const skillName = rest.join("/");

  const tempDir = mkdtempSync(join(tmpdir(), "lamda-skill-install-"));
  try {
    const exitCode = await new Promise<number>((resolvePromise, reject) => {
      const child = spawn(
        "npx",
        [
          "--yes",
          "skills@latest",
          "add",
          repoSource,
          "--agent",
          "pi",
          "--yes",
          ...(skillName ? ["--skill", skillName] : []),
        ],
        {
          cwd: tempDir,
          env: createCliEnv(),
          stdio: ["ignore", "pipe", "pipe"],
          timeout: INSTALL_TIMEOUT_MS,
        },
      );
      let output = "";
      const append = (chunk: Buffer) => {
        output = (output + chunk.toString("utf8")).slice(-OUTPUT_CAP);
      };
      child.stdout.on("data", append);
      child.stderr.on("data", append);
      child.on("error", reject);
      child.on("exit", (code, signal) => {
        if (code === 0) {
          resolvePromise(0);
          return;
        }
        const reason = signal
          ? `terminated by ${signal}`
          : `exited with code ${code}`;
        reject(new Error(cleanCliOutput(output) || `npx skills add ${reason}`));
      });
    });
    void exitCode;

    const installedDir = join(tempDir, ".pi", "skills");
    if (!existsSync(installedDir)) {
      return {
        success: false,
        error: "Install finished but no skill was written.",
      };
    }
    const installedNames = readdirSync(installedDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    if (installedNames.length === 0) {
      return {
        success: false,
        error: "Install finished but no skill was written.",
      };
    }

    // Best-effort: capture the registry's current content hash as the
    // baseline for update detection (see `getSkillUpdates`). The CLI itself
    // never surfaces a version signal, so this is a separate read-only fetch
    // against the same source just installed; a failure here only means
    // this skill won't get "update available" badges, not that the install
    // failed.
    let installedHash: string | undefined;
    try {
      const details = await getSkillDetails(source);
      installedHash = details?.hash;
    } catch {
      // ignored — see comment above
    }

    const globalDir = lamdaGlobalSkillsDir();
    let installed: InstalledSkill | null = null;
    for (const name of installedNames) {
      const from = join(installedDir, name);
      const to = join(globalDir, name);
      if (!isPathSafe(globalDir, to)) continue;
      rmSync(to, { recursive: true, force: true });
      // dereference: the CLI's canonical-skill layout sometimes symlinks the
      // agent-scoped copy back to a sibling dir inside tempDir — without this
      // we'd copy the link itself and it would dangle once tempDir is removed.
      cpSync(from, to, { recursive: true, dereference: true });
      const fm = readSkillFrontmatter(join(to, "SKILL.md"));
      recordInstallSource(name, source, installedHash);
      installed = {
        name,
        description: fm.description ?? "",
        updatedAt: Date.now(),
        source,
      };
    }
    if (!installed) {
      return {
        success: false,
        error: "Install finished but no skill was written.",
      };
    }
    return { success: true, skill: installed };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

export function removeInstalledSkill(
  name: string,
): { success: true } | { success: false; error: string } {
  if (!/^[\w.-]+$/.test(name)) {
    return { success: false, error: "Invalid skill name." };
  }
  const globalDir = lamdaGlobalSkillsDir();
  const target = join(globalDir, name);
  if (!isPathSafe(globalDir, target) || target === globalDir) {
    return { success: false, error: "Invalid skill name." };
  }
  if (!existsSync(target)) {
    return { success: false, error: "Skill not found." };
  }
  rmSync(target, { recursive: true, force: true });
  forgetInstallSource(name);
  return { success: true };
}

// ─── Install jobs ───────────────────────────────────────────────────────────
//
// An install runs `npx skills@latest` (cold-start download + a GitHub clone),
// which can comfortably exceed the client's request timeout. So, like the LSP
// installer, a POST kicks off the job and returns immediately; the client
// polls GET for status instead of holding the connection open.

export type SkillInstallStatus = "running" | "success" | "error";

export interface SkillInstallJob {
  id: string;
  source: string;
  status: SkillInstallStatus;
  skill?: InstalledSkill;
  error?: string;
  startedAt: number;
  finishedAt?: number;
}

const jobs = new Map<string, SkillInstallJob>();

export function getInstallJobs(): SkillInstallJob[] {
  return Array.from(jobs.values()).sort((a, b) => b.startedAt - a.startedAt);
}

export function startSkillInstall(source: string): SkillInstallJob {
  const job: SkillInstallJob = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    source,
    status: "running",
    startedAt: Date.now(),
  };
  jobs.set(job.id, job);

  installSkillFromRegistry(source)
    .then((result) => {
      job.finishedAt = Date.now();
      if (result.success) {
        job.status = "success";
        job.skill = result.skill;
      } else {
        job.status = "error";
        job.error = result.error;
      }
    })
    .catch((err) => {
      job.status = "error";
      job.error = err instanceof Error ? err.message : String(err);
      job.finishedAt = Date.now();
    });

  return job;
}
