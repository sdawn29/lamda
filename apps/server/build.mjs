import { build } from "esbuild";
import { createRequire } from "node:module";
import { cpSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const require = createRequire(import.meta.url);

function resolvePackageDir(packageName) {
  return dirname(require.resolve(`${packageName}/package.json`));
}

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: "dist/server.cjs",
  // Cannot bundle native .node addons — externalize and copy alongside bundle
  external: ["@silvia-odwyer/photon-node", "better-sqlite3", "node-pty"],
  minify: false,
  sourcemap: true,
});

// Copy native addons so dist/server.cjs can require() them at runtime
mkdirSync(resolve("dist/node_modules"), { recursive: true });

const addonSrc = resolvePackageDir("@silvia-odwyer/photon-node");
const addonDest = resolve("dist/node_modules/@silvia-odwyer/photon-node");
cpSync(addonSrc, addonDest, { recursive: true });

const bsq3Src = resolvePackageDir("better-sqlite3");
const bsq3Dest = resolve("dist/node_modules/better-sqlite3");
cpSync(bsq3Src, bsq3Dest, { recursive: true });

const nodePtySrc = resolvePackageDir("node-pty");
const nodePtyDest = resolve("dist/node_modules/node-pty");
cpSync(nodePtySrc, nodePtyDest, { recursive: true });

console.log("Build complete → dist/server.cjs");
