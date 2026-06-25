#!/usr/bin/env node
import { execFileSync, spawn } from "node:child_process";
import { delimiter, join } from "node:path";
import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";

const MIN_NODE = [22, 19, 0];

function parseVersion(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
  return match ? match.slice(1).map(Number) : null;
}

function compareVersions(a, b) {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

function isCompatible(version) {
  const parsed = parseVersion(version);
  return parsed !== null && compareVersions(parsed, MIN_NODE) >= 0;
}

function addIfFile(paths, candidate) {
  try {
    if (candidate && existsSync(candidate) && statSync(candidate).isFile()) {
      paths.add(candidate);
    }
  } catch {
    // Ignore unreadable candidates.
  }
}

function addVersionedNodeDirs(paths, baseDir, suffix = "bin/node") {
  try {
    for (const name of readdirSync(baseDir)) {
      addIfFile(paths, join(baseDir, name, suffix));
    }
  } catch {
    // Tool manager not installed or no versions present.
  }
}

function candidates() {
  const paths = new Set();
  addIfFile(paths, process.execPath);

  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    addIfFile(paths, join(dir, "node"));
  }

  for (const candidate of (process.env.LAMDA_NODE_CANDIDATES ?? "").split(delimiter)) {
    addIfFile(paths, candidate);
  }

  const home = homedir();
  addIfFile(paths, "/opt/homebrew/bin/node");
  addIfFile(paths, "/usr/local/bin/node");
  addVersionedNodeDirs(paths, join(home, ".volta/tools/image/node"));
  addVersionedNodeDirs(paths, join(home, ".nvm/versions/node"));
  addVersionedNodeDirs(paths, join(home, ".asdf/installs/nodejs"));
  addVersionedNodeDirs(paths, join(home, ".mise/installs/node"));
  addVersionedNodeDirs(paths, join(home, ".fnm/node-versions"), "installation/bin/node");

  return Array.from(paths);
}

function nodeVersion(nodePath) {
  try {
    return execFileSync(nodePath, ["-p", "process.version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 1_000,
    }).trim();
  } catch {
    return null;
  }
}

function resolveNode() {
  for (const nodePath of candidates()) {
    const version = nodeVersion(nodePath);
    if (version && isCompatible(version)) {
      return nodePath;
    }
  }
  return null;
}

const [entry, ...args] = process.argv.slice(2);
if (!entry) {
  console.error("Usage: node scripts/run-with-compatible-node.mjs <js-entry> [...args]");
  process.exit(2);
}

const nodePath = isCompatible(process.version) ? process.execPath : resolveNode();
if (!nodePath) {
  console.error(
    `Lamda development requires Node >= ${MIN_NODE.join(".")}.\n` +
      `Current Node is ${process.version} at ${process.execPath}.\n` +
      "Install a newer Node with your preferred manager, or set LAMDA_NODE_CANDIDATES to the full path of a compatible node binary.",
  );
  process.exit(1);
}

const child = spawn(nodePath, [entry, ...args], {
  stdio: "inherit",
  env: process.env,
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
