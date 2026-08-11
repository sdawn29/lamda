import { build } from "esbuild";
import { createRequire } from "node:module";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
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

function findPackageRoot(packageName, startDir = __dirname) {
  let dir = startDir;
  while (dir !== dirname(dir)) {
    const candidate = resolve(dir, "node_modules", packageName);
    if (existsSync(resolve(candidate, "package.json"))) return candidate;
    dir = dirname(dir);
  }
  throw new Error(`Could not locate ${packageName} in any node_modules above ${startDir}`);
}

// Wipe dist/ up front so stale layouts from previous builds (e.g. pre-refactor
// dist/node_modules/) cannot linger and mislead electron-builder.
rmSync(resolve("dist"), { recursive: true, force: true });

// The package's `exports` field forbids both `./package.json` and the CJS
// `require` condition, so require.resolve cannot see it — walk node_modules.
const piPackageDir = findPackageRoot("@earendil-works/pi-coding-agent");

// pi-ai's OAuth flows are loaded through a variable dynamic import so bundlers
// cannot follow them (see the registerBunOAuthFlows() call in @lamda/pi-sdk).
// That import survives bundling and then resolves next to server.cjs, so the
// packaged app cannot load any flow. pi-sdk defeats it by registering the
// statically imported flows from "@earendil-works/pi-ai/bun-oauth" — but the
// registry is module state, so it must land on the very pi-ai copy that
// pi-coding-agent itself resolves (npm may nest a second copy under it).
// Aliasing the exact subpath to that copy's file keeps one instance in the
// bundle; a bare package alias would bypass the exports map and fail to
// resolve the extensionless subpath.
const piAiDir = findPackageRoot("@earendil-works/pi-ai", piPackageDir);

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: "dist/server.cjs",
  // Cannot bundle native .node addons — externalize and copy alongside bundle
  external: ["@silvia-odwyer/photon-node", "better-sqlite3", "node-pty"],
  alias: {
    "@earendil-works/pi-ai/bun-oauth": resolve(piAiDir, "dist/bun-oauth.js"),
  },
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

// @earendil-works/pi-coding-agent reads its own package.json at module load to
// pick up `version`, `piConfig.name`, and `piConfig.configDir`. Once bundled
// into server.cjs, the SDK's getPackageDir() walks up from __dirname (= dist/
// in dev, Resources/server/ in prod) looking for the first package.json. Drop
// the SDK's package.json next to server.cjs so that walk succeeds and the
// SDK reads the right metadata (name "pi", configDir ".pi", real version).
copyFileSync(resolve(piPackageDir, "package.json"), resolve("dist/package.json"));

// @silvia-odwyer/photon-node is a dependency of @earendil-works/pi-coding-agent and
// may not be hoisted to a top-level node_modules — fall back to its nested location.
let addonSrc;
try {
  addonSrc = resolvePackageDir("@silvia-odwyer/photon-node");
} catch {
  addonSrc = resolve(piPackageDir, "node_modules/@silvia-odwyer/photon-node");
  if (!existsSync(resolve(addonSrc, "package.json"))) {
    throw new Error("Cannot find @silvia-odwyer/photon-node in hoisted or nested node_modules");
  }
}
cpSync(addonSrc, resolve("dist/addons/@silvia-odwyer/photon-node"), { recursive: true });

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

// Every provider's OAuth flow must be inside the bundle, registered on the one
// pi-ai instance the runtime uses. Otherwise pi-ai falls back to its variable
// dynamic import, which resolves next to server.cjs and fails — subscription
// sign-in then breaks in the packaged app only, where nobody sees a stack
// trace. Cheap to check here, so check it here.
function assertOAuthFlowsBundled() {
  const bundle = readFileSync(resolve("dist/server.cjs"), "utf-8");

  const flowPaths = [
    ...bundle.matchAll(
      /([\w@.\-/]*node_modules\/@earendil-works\/pi-ai)\/dist\/auth\/oauth\/(\w[\w-]*)\.js/g,
    ),
  ];
  const copies = new Set(flowPaths.map((m) => m[1]));
  const flows = new Set(flowPaths.map((m) => m[2]));

  if (!bundle.includes("registerBundledOAuthFlowLoaders")) {
    throw new Error(
      "[server build] pi-ai's bundled OAuth loaders are not registered. " +
        "Check the registerBunOAuthFlows() call in @lamda/pi-sdk.",
    );
  }
  for (const flow of ["anthropic", "openai-codex", "github-copilot"]) {
    if (!flows.has(flow)) {
      throw new Error(
        `[server build] OAuth flow "${flow}" was not bundled — sign-in would fail at runtime.`,
      );
    }
  }
  if (copies.size !== 1) {
    throw new Error(
      `[server build] ${copies.size} copies of @earendil-works/pi-ai in the bundle ` +
        `(${[...copies].join(", ")}). The flow registry is module state, so the ` +
        `bun-oauth alias in this file must point at the copy pi-coding-agent resolves.`,
    );
  }
}

assertOAuthFlowsBundled();

console.log("Build complete → dist/server.cjs");
