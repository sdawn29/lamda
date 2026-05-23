import { build } from "esbuild";
import { createRequire } from "node:module";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

function resolvePackageDir(packageName) {
  return dirname(require.resolve(`${packageName}/package.json`));
}

function findPackageRoot(packageName) {
  let dir = __dirname;
  while (dir !== dirname(dir)) {
    const candidate = resolve(dir, "node_modules", packageName);
    if (existsSync(resolve(candidate, "package.json"))) return candidate;
    dir = dirname(dir);
  }
  throw new Error(`Could not locate ${packageName} in any node_modules above ${__dirname}`);
}

// Wipe dist/ up front so stale layouts from previous builds (e.g. pre-refactor
// dist/node_modules/) cannot linger and mislead electron-builder.
rmSync(resolve("dist"), { recursive: true, force: true });

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
  // ESM packages that use import.meta.url (e.g. @earendil-works/pi-coding-agent)
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

// @earendil-works/pi-coding-agent reads its own package.json at module load to
// pick up `version`, `piConfig.name`, and `piConfig.configDir`. Once bundled
// into server.cjs, the SDK's getPackageDir() walks up from __dirname (= dist/
// in dev, Resources/server/ in prod) looking for the first package.json. Drop
// the SDK's package.json next to server.cjs so that walk succeeds and the
// SDK reads the right metadata (name "pi", configDir ".pi", real version).
// Note: the package's `exports` field forbids both `./package.json` and the
// CJS `require` condition, so neither require.resolve form works — fall back
// to walking the node_modules chain directly.
const piPackageDir = findPackageRoot("@earendil-works/pi-coding-agent");
copyFileSync(resolve(piPackageDir, "package.json"), resolve("dist/package.json"));

const REQUIRED_ADDONS = [
  "better-sqlite3",
  "bindings",
  "file-uri-to-path",
  "node-pty",
  "@silvia-odwyer/photon-node",
];

function assertAddonsPresent() {
  const missing = [];
  for (const name of REQUIRED_ADDONS) {
    const path = resolve("dist/addons", name);
    try {
      if (!statSync(path).isDirectory()) missing.push(name);
    } catch {
      missing.push(name);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `[server build] missing native addons in dist/addons/: ${missing.join(", ")}. ` +
        `Reinstall dependencies at the monorepo root and rebuild.`,
    );
  }
}

assertAddonsPresent();

console.log("Build complete → dist/server.cjs");
