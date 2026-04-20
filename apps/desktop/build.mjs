import { build } from "esbuild";
import { readFileSync, rmSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.resolve(__dirname, "../..");
const desktopPackageJson = JSON.parse(
  readFileSync(path.join(__dirname, "package.json"), "utf8"),
);
const rawElectronVersion = desktopPackageJson.devDependencies?.electron;
if (!rawElectronVersion) {
  throw new Error("[desktop build] electron not found in devDependencies");
}
const electronVersion = String(rawElectronVersion).replace(/^[^\d]*/, "");
const bundleOnly = process.argv.includes("--bundle-only");

function run(command, args, cwd = monorepoRoot) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      env: process.env,
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      const reason = signal ? `signal ${signal}` : `exit code ${code}`;
      reject(new Error(`${command} ${args.join(" ")} failed with ${reason}`));
    });
  });
}

await run("npm", ["run", "build", "-w", "web"]);

// Rebuild native modules for the packaged Electron runtime.
// Native modules (better-sqlite3, node-pty) are hoisted to the monorepo root
// node_modules/. We invoke node-gyp directly instead of @electron/rebuild
// because the rebuild CLI caches via a `.forge-meta` marker file and can
// silently skip producing a new .node binary even with --force, leaving a
// stale ABI. node-gyp-on-a-clean-build/ is the reliable primitive.
// @silvia-odwyer/photon-node is WASM — no native rebuild needed.
async function rebuildNativeModule(packageName) {
  const pkgDir = path.join(monorepoRoot, "node_modules", packageName);
  rmSync(path.join(pkgDir, "build"), { recursive: true, force: true });
  await run(
    path.join(monorepoRoot, "node_modules", ".bin", "node-gyp"),
    [
      "rebuild",
      `--target=${electronVersion}`,
      "--arch=arm64",
      "--dist-url=https://electronjs.org/headers",
      "--release",
    ],
    pkgDir,
  );
}

await rebuildNativeModule("better-sqlite3");
await rebuildNativeModule("node-pty");

await run("npm", ["run", "build", "-w", "@lamda/server"]);

// Belt-and-suspenders: the server build script already asserts addons/ exists,
// but double-check here so a cached/skipped workspace build can't slip a broken
// server/dist into electron-builder.
const serverDist = path.join(monorepoRoot, "apps/server/dist");
const requiredAddons = [
  "better-sqlite3",
  "bindings",
  "file-uri-to-path",
  "node-pty",
  "@silvia-odwyer/photon-node",
];
const serverCjs = path.join(serverDist, "server.cjs");
let serverCjsStat;
try {
  serverCjsStat = statSync(serverCjs);
} catch {
  throw new Error(`[desktop build] ${serverCjs} is missing`);
}
if (!serverCjsStat.isFile() || serverCjsStat.size === 0) {
  throw new Error(`[desktop build] ${serverCjs} is missing or empty`);
}
const missingAddons = requiredAddons.filter((name) => {
  try {
    return !statSync(path.join(serverDist, "addons", name)).isDirectory();
  } catch {
    return true;
  }
});
if (missingAddons.length > 0) {
  throw new Error(
    `[desktop build] missing native addons in apps/server/dist/addons/: ${missingAddons.join(", ")}. ` +
      `Run 'npm run build -w @lamda/server' and retry.`,
  );
}

await Promise.all([
  build({
    entryPoints: [path.join(__dirname, "src/main.ts")],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "esm",
    outfile: path.join(__dirname, "dist/main.js"),
    minify: true,
    sourcemap: false,
    external: ["electron", "esbuild", "electron-updater"],
  }),
  build({
    entryPoints: [path.join(__dirname, "src/preload.ts")],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile: path.join(__dirname, "dist/preload.cjs"),
    minify: true,
    sourcemap: false,
    external: ["electron"],
  }),
]);

if (!bundleOnly) {
  const publishFlag = process.env.PUBLISH === "1" ? "always" : "never";
  await run(
    path.join(monorepoRoot, "node_modules", ".bin", "electron-builder"),
    ["--mac", "dmg", "zip", "--arm64", "--publish", publishFlag],
    __dirname,
  );
}
