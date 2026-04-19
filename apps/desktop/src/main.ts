import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  nativeImage,
  shell,
} from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import {
  getOpenWithAppIcon,
  listOpenWithApps,
  openWorkspaceWithApp,
} from "./open-with.js";

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
const EXTERNAL_URL_PROTOCOL_RE = /^(https?:|mailto:)/i;

app.setName(APP_NAME);

console.log(`Running in ${isDev ? "development" : "production"} mode`);

type ServerStatus = {
  status: "starting" | "ready" | "failed";
  port: number | null;
  error: string | null;
};

const SERVER_READY_TIMEOUT_MS = 15_000;
const STDERR_TAIL_LIMIT = 8_000;

let serverProcess: ChildProcess | null = null;
let serverStatus: ServerStatus = {
  status: "starting",
  port: null,
  error: null,
};
let quitting = false;
let preloadPathPromise: Promise<string> | null = null;

type SelectFolderOptions = {
  canCreateFolder?: boolean;
};

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
          path.join(DEV_MONOREPO_ROOT, "node_modules/.bin/tsx"),
          [path.join(__dirname, "../../server/src/index.ts")],
        ] as const)
      : ([
          process.execPath,
          [path.join(process.resourcesPath, "server", "server.cjs")],
        ] as const);

    const child = spawn(executable, args, {
      env: {
        ...process.env,
        PORT: "0",
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
      },
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

async function createWindow() {
  const preloadPath = await getPreloadPath();
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 680,
    minHeight: 480,
    show: false,
    backgroundColor: "#09090b",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 12, y: 16 },
    webPreferences: {
      contextIsolation: true,
      devTools: true,
      nodeIntegration: false,
      preload: preloadPath,
      spellcheck: false,
    },
  });

  win.once("ready-to-show", () => {
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
  if (isDev && process.platform === "darwin") {
    const dockIcon = nativeImage.createFromPath(DEV_ICON_PATH);
    if (!dockIcon.isEmpty()) {
      app.dock?.setIcon(dockIcon);
    }
  }

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
  ipcMain.handle("restart-server", () => restartServer());

  ipcMain.handle("open-path", (_event, filePath: string) => {
    shell.showItemInFolder(filePath);
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

  ipcMain.handle("open-external", (_event, url: string) => {
    shell.openExternal(url);
  });

  await createWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on("before-quit", () => {
  quitting = true;
  globalShortcut.unregisterAll();
  serverProcess?.kill("SIGTERM");
  serverProcess = null;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
