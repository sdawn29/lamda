import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;
const DEV_MONOREPO_ROOT = path.join(__dirname, "../../..");
const DEV_SERVER_URL = "http://localhost:5173";
const PROD_INDEX = isDev
  ? ""
  : path.join(process.resourcesPath, "web", "index.html");
console.log(`Running in ${isDev ? "development" : "production"} mode`);

let serverProcess: ChildProcess | null = null;
let serverPort = 3001;
let preloadPathPromise: Promise<string> | null = null;

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

    serverProcess = spawn(executable, args, {
      env: {
        ...process.env,
        PORT: "0",
        ...(isDev ? {} : { ELECTRON_RUN_AS_NODE: "1" }),
      },
      // pipe stdout to read the ready JSON line; inherit stderr for logs
      stdio: ["ignore", "pipe", "inherit"],
    });

    let resolved = false;

    serverProcess.stdout!.on("data", (chunk: Buffer) => {
      for (const line of chunk.toString().split("\n")) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line) as { ready?: boolean; port?: number };
          if (msg.ready && typeof msg.port === "number" && !resolved) {
            resolved = true;
            resolve(msg.port);
          }
        } catch {
          // Non-JSON stdout lines after ready — ignore
        }
      }
    });

    serverProcess.on("error", (err) => {
      if (!resolved) reject(err);
    });

    serverProcess.on("exit", (code) => {
      serverProcess = null;
      if (!resolved)
        reject(new Error(`Server exited (code ${code}) before becoming ready`));
    });

    setTimeout(() => {
      if (!resolved)
        reject(new Error("Server did not become ready within 15s"));
    }, 15_000);
  });
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
  const out = path.join(tmpdir(), "lambda-preload.js");
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
      nodeIntegration: false,
      preload: preloadPath,
    },
  });

  win.once("ready-to-show", () => win.show());

  if (isDev) {
    await waitForDevServer(DEV_SERVER_URL);
    win.loadURL(DEV_SERVER_URL);
  } else {
    win.loadFile(PROD_INDEX);
  }
}

app.whenReady().then(async () => {
  serverPort = await spawnServer();

  ipcMain.handle("select-folder", async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win!, {
      properties: ["openDirectory"],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("get-server-port", () => serverPort);

  ipcMain.handle("open-path", (_event, filePath: string) => {
    shell.showItemInFolder(filePath);
  });

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
  serverProcess?.kill("SIGTERM");
  serverProcess = null;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
