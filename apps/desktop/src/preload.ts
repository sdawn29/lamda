import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  selectFolder: () => ipcRenderer.invoke("select-folder"),
  getServerPort: () => ipcRenderer.invoke("get-server-port"),
  openPath: (path: string) => ipcRenderer.invoke("open-path", path),
  gitStatus: (cwd: string) => ipcRenderer.invoke("git-status", cwd),
  gitFileDiff: (cwd: string, filePath: string, statusCode: string) =>
    ipcRenderer.invoke("git-file-diff", cwd, filePath, statusCode),
  gitCommit: (cwd: string, message: string) =>
    ipcRenderer.invoke("git-commit", cwd, message),
});
