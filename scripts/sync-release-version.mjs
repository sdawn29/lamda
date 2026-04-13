import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const rootPackagePath = path.join(repoRoot, "package.json");
const lockfilePath = path.join(repoRoot, "package-lock.json");
const semverPattern =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-.]+)?(?:\+[0-9A-Za-z-.]+)?$/;

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function toPosixPath(filePath) {
  return filePath.split(path.sep).join("/");
}

function getRequestedVersion(argv) {
  const versionFlagIndex = argv.indexOf("--version");

  if (versionFlagIndex !== -1) {
    const nextValue = argv[versionFlagIndex + 1];

    if (!nextValue) {
      throw new Error("Missing value for --version.");
    }

    return nextValue;
  }

  const rootPackage = readJson(rootPackagePath);
  return rootPackage.version;
}

function expandWorkspacePatterns(patterns) {
  const packagePaths = [];

  for (const pattern of patterns) {
    if (!pattern.endsWith("/*")) {
      continue;
    }

    const parentDir = path.join(repoRoot, pattern.slice(0, -2));

    if (!existsSync(parentDir)) {
      continue;
    }

    const entries = readdirSync(parentDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(parentDir, entry.name, "package.json"))
      .filter((filePath) => existsSync(filePath))
      .sort((left, right) => left.localeCompare(right));

    packagePaths.push(...entries);
  }

  return packagePaths;
}

function setPackageVersion(filePath, version) {
  const packageJson = readJson(filePath);

  if (packageJson.version === version) {
    return false;
  }

  packageJson.version = version;
  writeJson(filePath, packageJson);
  return true;
}

function syncLockfile(version, workspacePackagePaths) {
  const lockfile = readJson(lockfilePath);
  let changed = false;

  if (lockfile.version !== version) {
    lockfile.version = version;
    changed = true;
  }

  lockfile.packages ??= {};
  lockfile.packages[""] ??= {};

  if (lockfile.packages[""].version !== version) {
    lockfile.packages[""].version = version;
    changed = true;
  }

  for (const packagePath of workspacePackagePaths) {
    const relativePath = toPosixPath(path.relative(repoRoot, path.dirname(packagePath)));
    const lockfileEntry = lockfile.packages[relativePath];

    if (!lockfileEntry || lockfileEntry.version === version) {
      continue;
    }

    lockfileEntry.version = version;
    changed = true;
  }

  if (!changed) {
    return false;
  }

  const { name, version: nextVersion, lockfileVersion, requires, packages, ...rest } = lockfile;

  writeJson(lockfilePath, {
    name,
    version: nextVersion,
    lockfileVersion,
    requires,
    packages,
    ...rest,
  });

  return true;
}

const requestedVersion = getRequestedVersion(process.argv.slice(2));

if (!semverPattern.test(requestedVersion)) {
  throw new Error(`Invalid version: ${requestedVersion}`);
}

const rootPackage = readJson(rootPackagePath);
const workspacePackagePaths = expandWorkspacePatterns(rootPackage.workspaces ?? []);
const packagePaths = [rootPackagePath, ...workspacePackagePaths];
let updatedPackageCount = 0;

for (const packagePath of packagePaths) {
  if (setPackageVersion(packagePath, requestedVersion)) {
    updatedPackageCount += 1;
  }
}

const lockfileChanged = syncLockfile(requestedVersion, workspacePackagePaths);

console.log(
  `Synchronized version ${requestedVersion} across ${updatedPackageCount} package file(s)${lockfileChanged ? " and package-lock.json" : ""}.`,
);