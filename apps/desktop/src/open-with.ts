import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import {
  access,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const { app, nativeImage } = createRequire(import.meta.url)("electron") as typeof import("electron");

const execFileAsync = promisify(execFile);

const APP_SCAN_ROOTS = ["/Applications", "/System/Applications"];

const EDITOR_NAME_PATTERNS = [
  /^visual studio code(?: - insiders)?$/i,
  /^cursor$/i,
  /^windsurf$/i,
  /^zed(?: preview)?$/i,
  /^vscodium$/i,
  /^sublime text$/i,
  /^nova$/i,
  /^textmate$/i,
  /^bbedit$/i,
  /^coteditor$/i,
  /^xcode$/i,
  /^(?:intellij idea|webstorm|phpstorm|pycharm|rubymine|clion|goland|rider|fleet)(?: ce)?(?: [0-9.]+)?$/i,
];

export type OpenWithApp = {
  id: string;
  name: string;
  iconDataUrl: string | null;
};

type InstalledOpenWithApp = OpenWithApp & {
  appPath: string;
  plistInfo: PlistInfo | null;
};

type PlistInfo = {
  CFBundleDisplayName?: string;
  CFBundleIdentifier?: string;
  CFBundleIconFile?: string;
  CFBundleIconName?: string;
  CFBundleName?: string;
};

let cachedEditorAppsPromise: Promise<InstalledOpenWithApp[]> | null = null;
const cachedEditorAppIcons = new Map<string, Promise<string | null>>();

function isLikelyEditorApp(entryName: string): boolean {
  const appName = entryName.replace(/\.app$/i, "").trim();
  return EDITOR_NAME_PATTERNS.some((pattern) => pattern.test(appName));
}

async function walkForAppBundles(
  rootDir: string,
  depth: number,
  results: Set<string>,
): Promise<void> {
  let entries;
  try {
    entries = await readdir(rootDir, { withFileTypes: true });
  } catch {
    return;
  }

  await Promise.all(
    entries.map(async (entry) => {
      if (!entry.isDirectory() || entry.name.startsWith(".")) {
        return;
      }

      const entryPath = path.join(rootDir, entry.name);
      if (entry.name.endsWith(".app")) {
        if (!isLikelyEditorApp(entry.name)) {
          return;
        }

        try {
          results.add(await realpath(entryPath));
        } catch {
          results.add(entryPath);
        }
        return;
      }

      if (depth <= 0) {
        return;
      }

      await walkForAppBundles(entryPath, depth - 1, results);
    }),
  );
}

async function findInstalledEditorAppPaths(): Promise<string[]> {
  const roots = [
    ...APP_SCAN_ROOTS,
    path.join(app.getPath("home"), "Applications"),
  ];
  const results = new Set<string>();

  await Promise.all(roots.map((root) => walkForAppBundles(root, 2, results)));

  return [...results];
}

async function readPlistInfo(appPath: string): Promise<PlistInfo | null> {
  const infoPlistPath = path.join(appPath, "Contents", "Info.plist");

  try {
    const { stdout } = await execFileAsync("plutil", [
      "-convert",
      "json",
      "-o",
      "-",
      infoPlistPath,
    ]);
    return JSON.parse(stdout) as PlistInfo;
  } catch {
    return null;
  }
}

async function findExistingPath(paths: string[]): Promise<string | null> {
  for (const candidatePath of paths) {
    try {
      await access(candidatePath);
      return candidatePath;
    } catch {
      continue;
    }
  }

  return null;
}

async function resolveBundleIconPath(
  appPath: string,
  plistInfo: PlistInfo | null,
): Promise<string | null> {
  const resourcesDir = path.join(appPath, "Contents", "Resources");
  const iconNames = [plistInfo?.CFBundleIconFile, plistInfo?.CFBundleIconName]
    .filter((iconName): iconName is string => typeof iconName === "string")
    .map((iconName) => iconName.replace(/\.icns$/i, ""));

  for (const iconName of iconNames) {
    const resolvedPath = await findExistingPath([
      path.join(resourcesDir, `${iconName}.icns`),
      path.join(resourcesDir, `${iconName}.png`),
      path.join(resourcesDir, iconName),
    ]);
    if (resolvedPath) {
      return resolvedPath;
    }
  }

  return null;
}

function nativeImageToDataUrl(iconPath: string): string | null {
  try {
    const icon = nativeImage.createFromPath(iconPath);
    return icon.isEmpty() ? null : icon.toDataURL();
  } catch {
    return null;
  }
}

async function convertIcnsToDataUrl(iconPath: string): Promise<string | null> {
  let tempDir: string | null = null;

  try {
    tempDir = await mkdtemp(path.join(tmpdir(), "lamda-open-with-"));
    const outputPath = path.join(tempDir, "icon.png");

    await execFileAsync("sips", [
      "-s",
      "format",
      "png",
      iconPath,
      "--out",
      outputPath,
    ]);

    const pngBytes = await readFile(outputPath);
    const icon = nativeImage.createFromBuffer(pngBytes).resize({
      width: 32,
      height: 32,
      quality: "best",
    });

    if (!icon.isEmpty()) {
      return icon.toDataURL();
    }

    return `data:image/png;base64,${pngBytes.toString("base64")}`;
  } catch {
    return null;
  } finally {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(
        () => undefined,
      );
    }
  }
}

async function getIconDataUrl(
  appPath: string,
  plistInfo: PlistInfo | null,
): Promise<string | null> {
  const bundleIconPath = await resolveBundleIconPath(appPath, plistInfo);
  if (bundleIconPath) {
    const bundleIconDataUrl = bundleIconPath.endsWith(".icns")
      ? await convertIcnsToDataUrl(bundleIconPath)
      : nativeImageToDataUrl(bundleIconPath);

    if (bundleIconDataUrl) {
      return bundleIconDataUrl;
    }
  }

  try {
    const icon = await app.getFileIcon(appPath, { size: "normal" });
    return icon.isEmpty() ? null : icon.toDataURL();
  } catch {
    return null;
  }
}

async function loadInstalledEditorApps(): Promise<InstalledOpenWithApp[]> {
  const appPaths = await findInstalledEditorAppPaths();
  const apps = await Promise.all(
    appPaths.map(async (appPath) => {
      const plistInfo = await readPlistInfo(appPath);
      const appName =
        plistInfo?.CFBundleDisplayName ??
        plistInfo?.CFBundleName ??
        path.basename(appPath, ".app");
      const appId = plistInfo?.CFBundleIdentifier ?? `app:${appPath}`;
      const iconDataUrl = await getIconDataUrl(appPath, plistInfo);

      return {
        id: appId,
        name: appName,
        appPath,
        iconDataUrl,
        plistInfo,
      } satisfies InstalledOpenWithApp;
    }),
  );

  const uniqueApps = new Map<string, InstalledOpenWithApp>();
  for (const editorApp of apps) {
    if (!uniqueApps.has(editorApp.id)) {
      uniqueApps.set(editorApp.id, editorApp);
    }
  }

  return [...uniqueApps.values()].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

async function getInstalledEditorApps(
  forceRefresh = false,
): Promise<InstalledOpenWithApp[]> {
  if (process.platform !== "darwin") {
    return [];
  }

  if (!cachedEditorAppsPromise || forceRefresh) {
    if (forceRefresh) {
      cachedEditorAppIcons.clear();
    }

    cachedEditorAppsPromise = loadInstalledEditorApps().catch((error) => {
      cachedEditorAppsPromise = null;
      throw error;
    });
  }

  return cachedEditorAppsPromise;
}

export async function listOpenWithApps(): Promise<OpenWithApp[]> {
  const apps = await getInstalledEditorApps(true);
  return apps.map((editorApp) => ({
    id: editorApp.id,
    name: editorApp.name,
    iconDataUrl: null,
  }));
}

export async function getOpenWithAppIcon(
  appId: string,
): Promise<string | null> {
  const apps = await getInstalledEditorApps();
  const editorApp = apps.find((candidate) => candidate.id === appId);
  if (!editorApp) {
    return null;
  }

  const cachedIcon = cachedEditorAppIcons.get(appId);
  if (cachedIcon) {
    return cachedIcon;
  }

  const iconPromise = getIconDataUrl(
    editorApp.appPath,
    editorApp.plistInfo,
  ).catch(() => null);
  cachedEditorAppIcons.set(appId, iconPromise);
  return iconPromise;
}

export async function openWorkspaceWithApp(
  workspacePath: string,
  appId?: string,
): Promise<void> {
  let editorApps = await getInstalledEditorApps();
  let targetApp = appId
    ? editorApps.find((editorApp) => editorApp.id === appId)
    : editorApps[0];

  if (!targetApp && appId) {
    editorApps = await getInstalledEditorApps(true);
    targetApp = editorApps.find((editorApp) => editorApp.id === appId);
  }

  if (!targetApp) {
    throw new Error("No supported editors were found on this Mac.");
  }

  await execFileAsync("open", ["-a", targetApp.appPath, workspacePath]);
}
