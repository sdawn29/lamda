import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { transformSync } from "esbuild";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;
console.log(`Running in ${isDev ? "development" : "production"} mode`);

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
  ipcMain.handle("select-folder", async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win!, {
      properties: ["openDirectory"],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  await createWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
