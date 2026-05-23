#!/usr/bin/env node
/**
 * Local release script: analyzes conventional commits since the last tag,
 * bumps the version, updates CHANGELOG.md, syncs all workspace package versions,
 * commits, tags, and pushes to origin.
 *
 * Usage:
 *   node scripts/release.mjs           # auto-detect bump type from commits
 *   node scripts/release.mjs --dry-run # preview without making changes
 *   node scripts/release.mjs --patch   # force patch bump
 *   node scripts/release.mjs --minor   # force minor bump
 *   node scripts/release.mjs --major   # force major bump
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const changelogPath = path.join(repoRoot, "CHANGELOG.md");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const forceBump = args.includes("--major")
  ? "major"
  : args.includes("--minor")
    ? "minor"
    : args.includes("--patch")
      ? "patch"
      : null;

function run(cmd, opts = {}) {
  return (execSync(cmd, { cwd: repoRoot, encoding: "utf8", ...opts }) ?? "").trim();
}

function getLastTag() {
  try {
    const tags = run("git tag -l 'v*'")
      .split("\n")
      .map((t) => t.trim())
      .filter((t) => /^v\d+\.\d+\.\d+$/.test(t));

    if (tags.length === 0) return null;

    // Use the highest semver tag so a stray tag on a merged branch
    // doesn't shadow a real release tag ahead of it in the graph.
    return tags.sort((a, b) => {
      const av = a.slice(1).split(".").map(Number);
      const bv = b.slice(1).split(".").map(Number);
      for (let i = 0; i < 3; i++) {
        if (av[i] !== bv[i]) return bv[i] - av[i];
      }
      return 0;
    })[0];
  } catch {
    return null;
  }
}

function getCommitsSinceTag(tag) {
  const range = tag ? `${tag}..HEAD` : "HEAD";
  const log = run(`git log ${range} --format="%H\x1f%s\x1f%b\x1e"`);
  return log
    .split("\x1e")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [hash, subject, body = ""] = entry.split("\x1f");
      return { hash: hash?.trim(), subject: subject?.trim(), body: body.trim() };
    })
    .filter((c) => c.hash && c.subject);
}

function parseConventionalCommit(subject) {
  const match = subject?.match(/^(\w+)(\(([^)]+)\))?(!)?:\s*(.+)$/);
  if (!match) return null;
  return {
    type: match[1].toLowerCase(),
    scope: match[3] ?? null,
    breaking: match[4] === "!",
    description: match[5],
  };
}

function detectBumpType(commits) {
  let bump = "patch";
  for (const { subject, body } of commits) {
    const parsed = parseConventionalCommit(subject);
    if (!parsed) continue;
    if (parsed.breaking || /^BREAKING CHANGE:/m.test(body)) return "major";
    if (parsed.type === "feat" && bump !== "major") bump = "minor";
  }
  return bump;
}

function bumpVersion(version, type) {
  const parts = version.replace(/^v/, "").split(".").map(Number);
  if (type === "major") return `${parts[0] + 1}.0.0`;
  if (type === "minor") return `${parts[0]}.${parts[1] + 1}.0`;
  return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
}

const SECTION_ORDER = ["feat", "fix", "perf", "refactor", "docs", "chore"];
const SECTION_LABELS = {
  feat: "Features",
  fix: "Bug Fixes",
  perf: "Performance Improvements",
  refactor: "Code Refactoring",
  docs: "Documentation",
  chore: "Chores",
  other: "Other Changes",
};

function buildChangelogEntry(version, commits, date) {
  const sections = {};

  for (const { subject } of commits) {
    const parsed = parseConventionalCommit(subject);
    const key = parsed ? (sections[parsed.type] !== undefined || SECTION_ORDER.includes(parsed.type) ? parsed.type : "other") : "other";
    const label = parsed
      ? parsed.scope
        ? `**${parsed.scope}:** ${parsed.description}`
        : parsed.description
      : subject;
    (sections[key] ??= []).push(`* ${label}`);
  }

  let entry = `## [${version}](../../releases/tag/v${version}) — ${date}\n\n`;

  for (const type of [...SECTION_ORDER, "other"]) {
    if (!sections[type]?.length) continue;
    entry += `### ${SECTION_LABELS[type] ?? type}\n\n${sections[type].join("\n")}\n\n`;
  }

  return entry;
}

function updateChangelog(entry) {
  const existing = existsSync(changelogPath) ? readFileSync(changelogPath, "utf8") : "";
  const headerMatch = existing.match(/^(# [^\n]+\n\n?)/);
  if (headerMatch) {
    return existing.slice(0, headerMatch[0].length) + entry + existing.slice(headerMatch[0].length);
  }
  return `# Changelog\n\nAll notable changes to this project will be documented in this file.\n\n${entry}${existing}`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const lastTag = getLastTag();
const currentVersion = lastTag ? lastTag.replace(/^v/, "") : "0.0.0";
const commits = getCommitsSinceTag(lastTag);

if (commits.length === 0) {
  console.log("No commits since last release. Nothing to release.");
  process.exit(0);
}

const bumpType = forceBump ?? detectBumpType(commits);
const newVersion = bumpVersion(currentVersion, bumpType);
const tag = `v${newVersion}`;
const today = new Date().toISOString().split("T")[0];

console.log(`Last tag   : ${lastTag ?? "(none)"}`);
console.log(`Bump type  : ${bumpType}${forceBump ? " (forced)" : ""}`);
console.log(`New version: ${newVersion}`);
console.log(`Commits    : ${commits.length}`);
if (dryRun) console.log("\n[dry-run] No changes will be made.\n");

const changelogEntry = buildChangelogEntry(newVersion, commits, today);

console.log("\n--- Changelog entry ---");
console.log(changelogEntry.trimEnd());
console.log("--- end ---\n");

if (dryRun) process.exit(0);

// 1. Update CHANGELOG.md
writeFileSync(changelogPath, updateChangelog(changelogEntry));
console.log("Updated CHANGELOG.md");

// 2. Sync all package.json versions
run(`node scripts/sync-release-version.mjs --version ${newVersion}`, { stdio: "inherit" });

// Expand workspace glob patterns to actual file paths for git add
function expandWorkspacePackageGlobs() {
  const rootPackage = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  const paths = [];
  for (const pattern of rootPackage.workspaces ?? []) {
    if (!pattern.endsWith("/*")) continue;
    const parentDir = path.join(repoRoot, pattern.slice(0, -2));
    if (!existsSync(parentDir)) continue;
    const entries = readdirSync(parentDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => path.join(parentDir, e.name, "package.json"))
      .filter((f) => existsSync(f));
    paths.push(...entries);
  }
  return paths;
}

// 3. Commit
const workspacePackagePaths = expandWorkspacePackageGlobs();
run(
  `git add CHANGELOG.md package.json package-lock.json ${workspacePackagePaths.join(" ")}`,
);
run(`git commit -m "release: ${tag}"`);
console.log(`Committed release ${tag}`);

// 4. Tag
const tagExists = run(`git tag -l "${tag}"`)
  .split("\n")
  .map((t) => t.trim())
  .filter(Boolean)
  .includes(tag);
if (!tagExists) {
  run(`git tag -a "${tag}" -m "Release ${tag}"`);
  console.log(`Created tag ${tag}`);
} else {
  console.log(`Tag ${tag} already exists, skipping tag creation`);
}

// 5. Push
run("git push origin main", { stdio: "inherit" });
run(`git push origin "${tag}"`, { stdio: "inherit" });

console.log(`\nRelease ${tag} complete.`);
