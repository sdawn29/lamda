import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  selectFolder: () => ipcRenderer.invoke("select-folder"),
  getServerPort: () => ipcRenderer.invoke("get-server-port"),
  openPath: (path: string) => ipcRenderer.invoke("open-path", path),
});
