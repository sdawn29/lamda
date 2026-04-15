import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.resolve(__dirname, "../..");
const desktopPackageJson = JSON.parse(
  readFileSync(path.join(__dirname, "package.json"), "utf8"),
);
const electronVersion = String(
  desktopPackageJson.devDependencies.electron,
).replace(/^[^\d]*/, "");
const bundleOnly = process.argv.includes("--bundle-only");
const zipOnly = process.argv.includes("--zip-only");

function run(command, args, cwd = monorepoRoot) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      env: process.env,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(`${command} ${args.join(" ")} failed with exit code ${code}`),
      );
    });
  });
}

await run("npm", ["run", "build", "-w", "web"]);

// Rebuild native modules for the packaged Electron runtime.
// Native modules (better-sqlite3, node-pty, photon) are hoisted to the
// monorepo root node_modules/ — run the CLI from there so it locates them.
// Note: the @electron/rebuild JS API silently skips rebuilds in this monorepo
// layout; the CLI is the reliable alternative.
await run(
  path.join(monorepoRoot, "node_modules", ".bin", "electron-rebuild"),
  [
    "--version", electronVersion,
    "--arch", "arm64",
    "--force",
    "--only", "better-sqlite3,node-pty,@silvia-odwyer/photon-node",
  ],
  monorepoRoot,
);

await run("npm", ["run", "build", "-w", "@lamda/server"]);

await build({
  entryPoints: [path.join(__dirname, "src/main.ts")],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: path.join(__dirname, "dist/main.js"),
  minify: true,
  sourcemap: false,
  external: ["electron", "esbuild"],
});

await build({
  entryPoints: [path.join(__dirname, "src/preload.ts")],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: path.join(__dirname, "dist/preload.cjs"),
  minify: true,
  sourcemap: false,
  external: ["electron"],
});

if (!bundleOnly) {
  // GitHub Actions macOS runners don't expose /dev/disk devices, so hdiutil
  // (used internally by dmgbuild) fails with "Device not configured".
  // Pass --zip-only on CI to skip DMG and only produce the ZIP artifact.
  const targets = zipOnly ? ["zip"] : ["dmg", "zip"];
  await run(
    path.join(monorepoRoot, "node_modules", ".bin", "electron-builder"),
    ["--mac", ...targets, "--arm64", "--publish", "never"],
    __dirname,
  );
}
