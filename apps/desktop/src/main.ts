import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { transformSync } from "esbuild";
import { spawn, execFile, type ChildProcess } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;
console.log(`Running in ${isDev ? "development" : "production"} mode`);

let serverProcess: ChildProcess | null = null;
let serverPort = 3001;

async function spawnServer(): Promise<number> {
  return new Promise((resolve, reject) => {
    // In dev: use the tsx binary to run TypeScript source directly.
    // In prod: use Electron's bundled Node to run the pre-built CJS bundle.
    const monorepoRoot = path.join(__dirname, "../../..");
    const [executable, args] = isDev
      ? ([
          path.join(monorepoRoot, "node_modules/.bin/tsx"),
          [path.join(__dirname, "../../server/src/index.ts")],
        ] as const)
      : ([
          process.execPath,
          [path.join(process.resourcesPath, "server", "server.cjs")],
        ] as const);

    serverProcess = spawn(executable, args, {
      env: { ...process.env, PORT: "0" },
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
      if (!resolved) reject(new Error("Server did not become ready within 15s"));
    }, 15_000);
  });
}

function buildPreload(): string {
  const src = readFileSync(path.join(__dirname, "preload.ts"), "utf-8");
  const { code } = transformSync(src, {
    loader: "ts",
    format: "cjs",
    platform: "node",
  });
  const out = path.join(tmpdir(), "asphalt-preload.js");
  writeFileSync(out, code);
  return out;
}

const PRELOAD_PATH = buildPreload();

const DEV_SERVER_URL = "http://localhost:5173";
const PROD_INDEX = path.join(__dirname, "../../web/dist/index.html");

const LOADING_HTML = `data:text/html,${encodeURIComponent(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{
    background:#09090b;
    display:flex;
    align-items:center;
    justify-content:center;
    height:100vh;
    font-family:system-ui,sans-serif;
    color:#fafafa;
    font-size:18px;
    font-weight:500;
    letter-spacing:.08em;
  }
</style>
</head>
<body>
  <span>asphalt code</span>
</body>
</html>`)}`;

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
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    backgroundColor: "#09090b",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 12, y: 16 },
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: PRELOAD_PATH,
    },
  });

  win.once("ready-to-show", () => win.show());

  if (isDev) {
    win.loadURL(LOADING_HTML);
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

  ipcMain.handle("git-status", (_event, cwd: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      execFile("git", ["status", "--short"], { cwd }, (err, stdout, stderr) => {
        if (err) reject(new Error(stderr || err.message));
        else resolve(stdout);
      });
    });
  });

  ipcMain.handle(
    "git-file-diff",
    (_event, cwd: string, filePath: string, statusCode: string): Promise<string> => {
      return new Promise((resolve, reject) => {
        const isUntracked = statusCode.trim() === "??";
        const args = isUntracked
          ? ["diff", "--no-index", "--", "/dev/null", filePath]
          : ["diff", "HEAD", "--", filePath];
        execFile("git", args, { cwd }, (err, stdout, stderr) => {
          // git diff --no-index exits with code 1 when there are differences — not an error
          if (err && !stdout) reject(new Error(stderr || err.message));
          else resolve(stdout);
        });
      });
    },
  );

  ipcMain.handle(
    "git-commit",
    (_event, cwd: string, message: string): Promise<string> => {
      return new Promise((resolve, reject) => {
        execFile("git", ["add", "-A"], { cwd }, (err, _stdout, stderr) => {
          if (err) return reject(new Error(stderr || err.message));
          execFile(
            "git",
            ["commit", "-m", message],
            { cwd },
            (err2, stdout2, stderr2) => {
              if (err2) reject(new Error(stderr2 || err2.message));
              else resolve(stdout2);
            },
          );
        });
      });
    },
  );

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
