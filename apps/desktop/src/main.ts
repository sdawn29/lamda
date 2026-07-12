import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  powerMonitor,
  session,
  shell,
  type MenuItemConstructorOptions,
} from "electron";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createCliEnv } from "@lamda/cli-env";
import {
  getInstalledEditorApps,
  getOpenWithAppIcon,
  listOpenWithApps,
  openWorkspaceWithApp,
} from "./open-with.js";

const require = createRequire(import.meta.url);
const { autoUpdater } =
  require("electron-updater") as typeof import("electron-updater");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;
const DEV_MONOREPO_ROOT = path.join(__dirname, "../../..");
const DEV_SERVER_URL = "http://localhost:5173";
const APP_NAME = "lamda";
const DEV_ICON_PATH = path.join(
  DEV_MONOREPO_ROOT,
  "apps",
  "desktop",
  "assets",
  "icon.png",
);
const PROD_INDEX = isDev
  ? ""
  : path.join(process.resourcesPath, "web", "index.html");
const SPLASH_HTML_PATH = isDev
  ? path.join(DEV_MONOREPO_ROOT, "apps", "desktop", "assets", "splash.html")
  : path.join(process.resourcesPath, "splash.html");
const EXTERNAL_URL_PROTOCOL_RE = /^(https?:|mailto:)/i;

// Per-launch shared secret. Handed to the spawned server via env and to the
// renderer via IPC so every HTTP request and WebSocket connection can be
// authenticated — this is what stops other local processes / websites the user
// visits from driving the server's API. Regenerated on every app start.
const SERVER_AUTH_TOKEN = randomBytes(32).toString("hex");

app.setName(APP_NAME);

// In dev the renderer loads from the Vite dev server, whose module URLs are
// versioned per dependency-optimization run (`?v=<browserHash>`). Electron's
// Chromium HTTP cache persists across app restarts, so after the dep graph
// changes (npm install → Vite re-optimizes) a cached page can execute modules
// from mixed optimization runs — which duplicates React and crashes with
// "Invalid hook call". Vite serves everything from memory locally, so the
// cache buys nothing in dev; disable it outright.
if (isDev) {
  app.commandLine.appendSwitch("disable-http-cache");
}

console.log(`Running in ${isDev ? "development" : "production"} mode`);

type ServerStatus = {
  status: "starting" | "ready" | "failed";
  port: number | null;
  error: string | null;
};

type UpdateStatus =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "available"; version: string; releaseNotes: string | null }
  | {
      phase: "downloading";
      version: string;
      percent: number;
      bytesPerSecond: number;
      total: number;
      releaseNotes: string | null;
    }
  | { phase: "ready"; version: string; releaseNotes: string | null }
  | { phase: "error"; message: string };

type AppSettings = {
  autoUpdateEnabled: boolean;
};

const DEFAULT_APP_SETTINGS: AppSettings = { autoUpdateEnabled: true };

// How often to re-check for updates in the background after the initial
// post-launch check. electron-updater tolerates overlapping checkForUpdates()
// calls poorly, so callers must go through runUpdateCheck() below.
const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

// Startup can include database migrations, native module loading, and local
// model/tool discovery. Keep the splash visible rather than failing a healthy
// launch on slower machines.
const SERVER_READY_TIMEOUT_MS = 60_000;
const STDERR_TAIL_LIMIT = 8_000;

let serverProcess: ChildProcess | null = null;
let serverStatus: ServerStatus = {
  status: "starting",
  port: null,
  error: null,
};
let quitting = false;
let preloadPathPromise: Promise<string> | null = null;
let updateStatus: UpdateStatus = { phase: "idle" };
let pendingUpdateVersion = "";
let pendingReleaseNotes: string | null = null;
let appSettings: AppSettings = { ...DEFAULT_APP_SETTINGS };
let updateCheckInterval: ReturnType<typeof setInterval> | null = null;
let updateCheckInFlight = false;

function getSettingsFilePath(): string {
  return path.join(app.getPath("userData"), "settings.json");
}

function loadAppSettings(): AppSettings {
  try {
    const raw = readFileSync(getSettingsFilePath(), "utf-8");
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return { ...DEFAULT_APP_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_APP_SETTINGS };
  }
}

function saveAppSettings(settings: AppSettings) {
  try {
    mkdirSync(path.dirname(getSettingsFilePath()), { recursive: true });
    writeFileSync(getSettingsFilePath(), JSON.stringify(settings, null, 2));
  } catch (err) {
    console.error("Failed to persist app settings:", err);
  }
}

type SelectFolderOptions = {
  canCreateFolder?: boolean;
};

type RendererMenuAction =
  | "new_thread"
  | "new_workspace"
  | "open_command_palette"
  | "open_settings"
  | "open_in_editor"
  | "toggle_sidebar"
  | "toggle_review_panel"
  | "toggle_file_tree"
  | "toggle_terminal"
  | "toggle_fullscreen_diff"
  | "toggle_theme"
  | "rename_thread"
  | "navigate_back"
  | "navigate_forward"
  | "scroll_to_bottom";

type MenuRole = NonNullable<MenuItemConstructorOptions["role"]>;

function sendRendererMenuAction(action: RendererMenuAction) {
  const win =
    BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  if (!win || win.isDestroyed()) return;
  win.webContents.send("native-menu-action", action);
}

function separator(): MenuItemConstructorOptions {
  return { type: "separator" };
}

function roleItem(role: MenuRole): MenuItemConstructorOptions {
  return { role };
}

function menuAction(
  label: string,
  accelerator: string,
  action: RendererMenuAction,
): MenuItemConstructorOptions {
  return {
    label,
    accelerator,
    click: () => sendRendererMenuAction(action),
  };
}

function installApplicationMenu() {
  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === "darwin"
      ? [
          {
            label: app.name,
            submenu: [
              roleItem("about"),
              separator(),
              menuAction("Settings...", "Command+,", "open_settings"),
              separator(),
              roleItem("services"),
              separator(),
              roleItem("hide"),
              roleItem("hideOthers"),
              roleItem("unhide"),
              separator(),
              roleItem("quit"),
            ],
          } satisfies MenuItemConstructorOptions,
        ]
      : []),
    {
      label: "File",
      submenu: [
        menuAction("New Thread", "CommandOrControl+T", "new_thread"),
        menuAction("New Workspace", "CommandOrControl+Shift+N", "new_workspace"),
        separator(),
        menuAction(
          "Open in Editor",
          "CommandOrControl+Shift+E",
          "open_in_editor",
        ),
        separator(),
        roleItem(process.platform === "darwin" ? "close" : "quit"),
      ],
    },
    {
      label: "Edit",
      submenu: [
        roleItem("undo"),
        roleItem("redo"),
        separator(),
        roleItem("cut"),
        roleItem("copy"),
        roleItem("paste"),
        roleItem("pasteAndMatchStyle"),
        roleItem("delete"),
        separator(),
        roleItem("selectAll"),
      ],
    },
    {
      label: "View",
      submenu: [
        menuAction(
          "Command Palette",
          "CommandOrControl+K",
          "open_command_palette",
        ),
        separator(),
        menuAction("Toggle Sidebar", "CommandOrControl+B", "toggle_sidebar"),
        menuAction(
          "Toggle Review Panel",
          "CommandOrControl+Shift+D",
          "toggle_review_panel",
        ),
        menuAction(
          "Toggle File Tree",
          "CommandOrControl+Shift+F",
          "toggle_file_tree",
        ),
        menuAction("Toggle Terminal", "Control+`", "toggle_terminal"),
        menuAction(
          "Toggle Fullscreen Review",
          "CommandOrControl+Shift+Enter",
          "toggle_fullscreen_diff",
        ),
        separator(),
        menuAction("Toggle Theme", "CommandOrControl+Shift+L", "toggle_theme"),
        roleItem("togglefullscreen"),
        separator(),
        roleItem("reload"),
        roleItem("forceReload"),
        roleItem("toggleDevTools"),
      ],
    },
    {
      label: "Navigate",
      submenu: [
        menuAction("Back", "CommandOrControl+[", "navigate_back"),
        menuAction("Forward", "CommandOrControl+]", "navigate_forward"),
        separator(),
        menuAction(
          "Scroll to Bottom",
          "CommandOrControl+Down",
          "scroll_to_bottom",
        ),
      ],
    },
    {
      label: "Thread",
      submenu: [menuAction("Rename Thread", "F2", "rename_thread")],
    },
    {
      label: "Window",
      submenu: [
        roleItem("minimize"),
        roleItem("zoom"),
        ...(process.platform === "darwin"
          ? [separator(), roleItem("front")]
          : []),
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "Open Data Directory",
          click: () => {
            const dataDir = path.join(homedir(), ".lamda");
            void shell.openPath(dataDir);
          },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function setUpdateStatus(next: UpdateStatus) {
  updateStatus = next;
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("update-status-changed", next);
    }
  }
}

// Applies the current auto-update preference to electron-updater's flags.
// Safe to call at any time (including from the settings IPC handler) so a
// runtime toggle takes effect immediately without an app restart.
function applyAutoUpdatePolicy() {
  autoUpdater.autoDownload = appSettings.autoUpdateEnabled;
  autoUpdater.autoInstallOnAppQuit = appSettings.autoUpdateEnabled;
}

// Runs a single checkForUpdates() pass, guarded against overlap — electron-
// updater doesn't handle concurrent checks well, so both the periodic timer
// and the manual "check-for-updates" IPC handler funnel through here.
async function runUpdateCheck(): Promise<void> {
  if (updateCheckInFlight) return;
  updateCheckInFlight = true;
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    setUpdateStatus({
      phase: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  } finally {
    updateCheckInFlight = false;
  }
}

function setupAutoUpdater() {
  if (!app.isPackaged) return;

  applyAutoUpdatePolicy();

  autoUpdater.on("checking-for-update", () => {
    setUpdateStatus({ phase: "checking" });
  });

  autoUpdater.on("update-available", (info) => {
    pendingUpdateVersion = info.version;
    pendingReleaseNotes =
      typeof info.releaseNotes === "string" ? info.releaseNotes : null;
    setUpdateStatus({
      phase: "available",
      version: info.version,
      releaseNotes: pendingReleaseNotes,
    });
  });

  autoUpdater.on("update-not-available", () => {
    setUpdateStatus({ phase: "idle" });
  });

  autoUpdater.on("download-progress", (p) => {
    setUpdateStatus({
      phase: "downloading",
      version: pendingUpdateVersion,
      percent: p.percent,
      bytesPerSecond: p.bytesPerSecond,
      total: p.total,
      releaseNotes: pendingReleaseNotes,
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    setUpdateStatus({
      phase: "ready",
      version: info.version,
      releaseNotes: pendingReleaseNotes,
    });
  });

  autoUpdater.on("error", (err) => {
    setUpdateStatus({ phase: "error", message: err.message });
  });

  setTimeout(() => {
    void runUpdateCheck();
  }, 10_000);

  updateCheckInterval = setInterval(() => {
    void runUpdateCheck();
  }, UPDATE_CHECK_INTERVAL_MS);
}

/**
 * Apply a Content-Security-Policy to renderer documents in production. Limits
 * script execution to bundled app code and restricts network access to the
 * local server, shrinking the blast radius of any injected/XSS content. Skipped
 * in dev because Vite's HMR relies on inline scripts and eval. `connect-src`
 * permits any localhost port since the server uses an ephemeral one.
 */
function installContentSecurityPolicy() {
  if (!app.isPackaged) return;
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: http://localhost:* http://127.0.0.1:*",
    "font-src 'self' data:",
    "connect-src 'self' http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:*",
  ].join("; ");

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [policy],
      },
    });
  });
}

function setServerStatus(next: ServerStatus) {
  serverStatus = next;
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("server-status-changed", next);
    }
  }
}

async function spawnServer(): Promise<number> {
  return new Promise((resolve, reject) => {
    const [executable, args] = isDev
      ? ([
          "node",
          [
            path.join(
              DEV_MONOREPO_ROOT,
              "scripts/run-with-compatible-node.mjs",
            ),
            require.resolve("tsx/cli"),
            path.join(__dirname, "../../server/src/index.ts"),
          ],
        ] as const)
      : ([
          process.execPath,
          [path.join(process.resourcesPath, "server", "server.cjs")],
        ] as const);

    const child = spawn(executable, args, {
      env: createCliEnv({
        PORT: "0",
        LAMDA_AUTH_TOKEN: SERVER_AUTH_TOKEN,
        ...(isDev
          ? {}
          : {
              ELECTRON_RUN_AS_NODE: "1",
              // Native addons (better-sqlite3, node-pty, photon) live in
              // resources/server/addons/ rather than node_modules/ because
              // electron-builder unconditionally strips root-level node_modules
              // from extraResources. NODE_PATH makes require('<pkg>') find them.
              NODE_PATH: path.join(process.resourcesPath, "server", "addons"),
            }),
      }),
      // pipe stdout to read the ready JSON line; pipe stderr so we can forward
      // to our own stderr AND keep a rolling tail for ServerStatus error payload
      stdio: ["ignore", "pipe", "pipe"],
    });

    serverProcess = child;

    let resolved = false;
    let stderrTail = "";

    const fail = (err: Error) => {
      if (resolved) return;
      resolved = true;
      const message = stderrTail
        ? `${err.message}\n\n${stderrTail.trim()}`
        : err.message;
      reject(new Error(message));
    };

    child.stdout!.on("data", (chunk: Buffer) => {
      for (const line of chunk.toString().split("\n")) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line) as { ready?: boolean; port?: number };
          if (msg.ready && typeof msg.port === "number" && !resolved) {
            resolved = true;
            resolve(msg.port);
          }
        } catch {
          process.stderr.write(line + "\n");
        }
      }
    });

    child.stderr!.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      process.stderr.write(text);
      stderrTail = (stderrTail + text).slice(-STDERR_TAIL_LIMIT);
    });

    child.on("error", (err) => fail(err));

    child.on("exit", (code, signal) => {
      if (serverProcess === child) serverProcess = null;
      if (!resolved) {
        fail(
          new Error(
            `Server exited (code ${code}${signal ? `, signal ${signal}` : ""}) before becoming ready`,
          ),
        );
      }
    });

    setTimeout(() => {
      fail(
        new Error(
          `Server did not become ready within ${SERVER_READY_TIMEOUT_MS / 1000}s`,
        ),
      );
    }, SERVER_READY_TIMEOUT_MS);
  });
}

async function startServerAndTrack(): Promise<void> {
  setServerStatus({ status: "starting", port: null, error: null });
  try {
    const port = await spawnServer();
    setServerStatus({ status: "ready", port, error: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[server] failed to start:", message);
    setServerStatus({ status: "failed", port: null, error: message });
  }
}

async function restartServer(): Promise<ServerStatus> {
  if (quitting) return serverStatus;
  if (serverStatus.status === "starting") return serverStatus;

  const existing = serverProcess;
  if (existing && !existing.killed) {
    await new Promise<void>((resolveKill) => {
      const timeout = setTimeout(() => resolveKill(), 2_000);
      existing.once("exit", () => {
        clearTimeout(timeout);
        resolveKill();
      });
      try {
        existing.kill("SIGTERM");
      } catch {
        clearTimeout(timeout);
        resolveKill();
      }
    });
  }
  serverProcess = null;

  await startServerAndTrack();
  return serverStatus;
}

async function buildPreload(): Promise<string> {
  const [{ readFileSync, writeFileSync }, { tmpdir }, { transformSync }] =
    await Promise.all([
      import("node:fs"),
      import("node:os"),
      import("esbuild"),
    ]);
  const src = readFileSync(path.join(__dirname, "preload.ts"), "utf-8");
  const { code } = transformSync(src, {
    loader: "ts",
    format: "cjs",
    platform: "node",
  });
  const out = path.join(tmpdir(), "lamda-preload.js");
  writeFileSync(out, code);
  return out;
}

async function getPreloadPath(): Promise<string> {
  if (!isDev) {
    return path.join(__dirname, "preload.cjs");
  }

  preloadPathPromise ??= buildPreload();
  return preloadPathPromise;
}

async function waitForDevServer(url: string, timeout = 30_000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status < 500) return;
    } catch {
      // server not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `Dev server at ${url} did not become ready within ${timeout}ms`,
  );
}

async function createSplashWindow(): Promise<BrowserWindow> {
  const splash = new BrowserWindow({
    width: 320,
    height: 380,
    center: true,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    show: false,
    backgroundColor: "#09090b",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  splash.once("ready-to-show", () => splash.show());
  void splash.loadFile(SPLASH_HTML_PATH);
  return splash;
}

async function createWindow(splash?: BrowserWindow) {
  const preloadPath = await getPreloadPath();
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 680,
    minHeight: 480,
    show: false,
    backgroundColor: "#09090b",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 17 },
    webPreferences: {
      contextIsolation: true,
      devTools: !app.isPackaged,
      nodeIntegration: false,
      preload: preloadPath,
      spellcheck: false,
    },
  });

  // Keep the renderer pinned to the app itself. Any attempt to navigate the main
  // frame elsewhere (e.g. an injected link) is cancelled; genuine external links
  // are routed to the OS browser via setWindowOpenHandler below instead.
  win.webContents.on("will-navigate", (event, url) => {
    const allowed = isDev
      ? url.startsWith(DEV_SERVER_URL)
      : url.startsWith("file://");
    if (!allowed) {
      event.preventDefault();
      if (EXTERNAL_URL_PROTOCOL_RE.test(url)) void shell.openExternal(url);
    }
  });

  win.once("ready-to-show", () => {
    if (splash && !splash.isDestroyed()) {
      splash.close();
    }
    win.show();
    globalShortcut.register("CommandOrControl+Alt+I", () => {
      const focused = BrowserWindow.getFocusedWindow();
      if (focused) focused.webContents.toggleDevTools();
    });
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (EXTERNAL_URL_PROTOCOL_RE.test(url)) {
      void shell.openExternal(url);
    }

    return { action: "deny" };
  });

  win.on("enter-full-screen", () => {
    win.webContents.send("fullscreen-changed", true);
  });
  win.on("leave-full-screen", () => {
    win.webContents.send("fullscreen-changed", false);
  });

  if (isDev) {
    await waitForDevServer(DEV_SERVER_URL);
    win.loadURL(DEV_SERVER_URL);
  } else {
    win.loadFile(PROD_INDEX);
  }
}

app.whenReady().then(async () => {
  appSettings = loadAppSettings();

  installApplicationMenu();

  if (isDev && process.platform === "darwin") {
    const dockIcon = nativeImage.createFromPath(DEV_ICON_PATH);
    if (!dockIcon.isEmpty()) {
      app.dock?.setIcon(dockIcon);
    }
  }

  installContentSecurityPolicy();

  const splash = await createSplashWindow();

  await startServerAndTrack();

  ipcMain.handle("get-fullscreen", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win?.isFullScreen() ?? false;
  });

  ipcMain.handle(
    "select-folder",
    async (event, options?: SelectFolderOptions) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      const properties: Array<"openDirectory" | "createDirectory"> = [
        "openDirectory",
      ];
      if (process.platform === "darwin" && options?.canCreateFolder) {
        properties.push("createDirectory");
      }
      const result = await dialog.showOpenDialog(win!, {
        properties,
      });
      return result.canceled ? null : result.filePaths[0];
    },
  );

  ipcMain.handle("get-server-status", () => serverStatus);
  ipcMain.handle("get-server-port", () => serverStatus.port);
  ipcMain.handle("get-server-token", () => SERVER_AUTH_TOKEN);
  ipcMain.handle("restart-server", () => restartServer());

  ipcMain.handle("open-path", (_event, filePath: string) => {
    shell.showItemInFolder(filePath);
  });

  ipcMain.handle("open-data-dir", () => {
    const dataDir = path.join(homedir(), ".lamda");
    shell.openPath(dataDir);
  });

  ipcMain.handle("list-open-with-apps", async () => {
    return listOpenWithApps();
  });

  ipcMain.handle("get-open-with-app-icon", async (_event, appId: string) => {
    if (!appId) {
      return null;
    }

    return getOpenWithAppIcon(appId);
  });

  ipcMain.handle(
    "open-workspace-with-app",
    async (
      _event,
      payload: { workspacePath?: string; appId?: string } | undefined,
    ) => {
      const workspacePath = payload?.workspacePath?.trim();
      if (!workspacePath) {
        throw new Error("A workspace path is required.");
      }

      if (process.platform !== "darwin") {
        await shell.openPath(workspacePath);
        return;
      }

      await openWorkspaceWithApp(workspacePath, payload?.appId);
    },
  );

  ipcMain.handle(
    "open-file-with-app",
    async (
      _event,
      payload: { filePath?: string; appId?: string } | undefined,
    ) => {
      const filePath = payload?.filePath?.trim();
      if (!filePath) {
        throw new Error("A file path is required.");
      }

      const execFileAsync = promisify(execFile);

      if (process.platform !== "darwin") {
        await shell.openPath(filePath);
        return;
      }

      // On macOS, use the open command with the specific app
      if (payload?.appId) {
        const editorApps = await getInstalledEditorApps();
        const editorApp = editorApps.find((app) => app.id === payload.appId);
        if (editorApp) {
          await execFileAsync("open", ["-a", editorApp.appPath, filePath]);
          return;
        }
      }

      // No specific app, open with default
      await shell.openPath(filePath);
    },
  );

  ipcMain.handle("open-external", (_event, url: string) => {
    shell.openExternal(url);
  });

  ipcMain.handle("get-update-status", () => updateStatus);

  ipcMain.handle("check-for-updates", async () => {
    if (!app.isPackaged) return updateStatus;
    await runUpdateCheck();
    return updateStatus;
  });

  ipcMain.handle("download-update", async () => {
    if (!app.isPackaged) return;
    await autoUpdater.downloadUpdate();
  });

  ipcMain.handle("install-update", () => {
    autoUpdater.quitAndInstall();
  });

  ipcMain.handle("get-auto-update-enabled", () => appSettings.autoUpdateEnabled);

  ipcMain.handle("set-auto-update-enabled", (_event, enabled: boolean) => {
    appSettings = { ...appSettings, autoUpdateEnabled: enabled };
    saveAppSettings(appSettings);
    // Reconfigure the live autoUpdater flags immediately; inert (but
    // harmless) when !app.isPackaged since setupAutoUpdater() never ran.
    applyAutoUpdatePolicy();
  });

  await createWindow(splash);
  setupAutoUpdater();

  powerMonitor.on("resume", () => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send("system-resume");
      }
    }
  });

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on("before-quit", () => {
  quitting = true;
  globalShortcut.unregisterAll();
  if (updateCheckInterval) {
    clearInterval(updateCheckInterval);
    updateCheckInterval = null;
  }
  serverProcess?.kill("SIGTERM");
  serverProcess = null;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
