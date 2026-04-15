import { build } from "esbuild";
import { createRequire } from "node:module";
import { cpSync, mkdirSync, rmSync } from "node:fs";
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
  // ESM packages that use import.meta.url (e.g. @mariozechner/pi-coding-agent)
  // get import.meta stubbed as {} by esbuild when bundling to CJS, causing
  // fileURLToPath(import.meta.url) to throw at startup. Inject a shim that
  // derives the file URL from CJS __filename, then replace the identifier.
  banner: {
    js: "const __importMetaUrl = require('url').pathToFileURL(__filename).href;",
  },
  define: {
    "import.meta.url": "__importMetaUrl",
  },
});

// Remove any stale node_modules directory left over from a previous build that
// used a different output path, so the dist tree stays clean.
rmSync(resolve("dist/node_modules"), { recursive: true, force: true });

// Copy native addons so dist/server.cjs can require() them at runtime.
// Named "addons" (not "node_modules") so electron-builder does not strip the
// directory — electron-builder unconditionally excludes any root-level
// "node_modules" folder from extraResources regardless of the filter patterns.
// At runtime, apps/desktop/src/main.ts sets NODE_PATH to this directory so
// Node's module resolver finds the packages via require('<package-name>').
mkdirSync(resolve("dist/addons"), { recursive: true });

// better-sqlite3 and its runtime dependencies:
//   better-sqlite3 → bindings → file-uri-to-path
const bsq3Src = resolvePackageDir("better-sqlite3");
cpSync(bsq3Src, resolve("dist/addons/better-sqlite3"), { recursive: true });

const bindingsSrc = resolvePackageDir("bindings");
cpSync(bindingsSrc, resolve("dist/addons/bindings"), { recursive: true });

const fileUriSrc = resolvePackageDir("file-uri-to-path");
cpSync(fileUriSrc, resolve("dist/addons/file-uri-to-path"), { recursive: true });

// node-pty (no external runtime npm deps — only built-in Node modules)
const nodePtySrc = resolvePackageDir("node-pty");
cpSync(nodePtySrc, resolve("dist/addons/node-pty"), { recursive: true });

// @silvia-odwyer/photon-node (no runtime npm deps)
const addonSrc = resolvePackageDir("@silvia-odwyer/photon-node");
cpSync(addonSrc, resolve("dist/addons/@silvia-odwyer/photon-node"), { recursive: true });

console.log("Build complete → dist/server.cjs");
