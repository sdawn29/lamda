import { contextBridge, ipcRenderer } from "electron";

type SelectFolderOptions = {
  canCreateFolder?: boolean;
};

type OpenWithApp = {
  id: string;
  name: string;
  iconDataUrl: string | null;
};

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

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  selectFolder: (options?: SelectFolderOptions) =>
    ipcRenderer.invoke("select-folder", options),
  getServerPort: () => ipcRenderer.invoke("get-server-port"),
  getServerToken: (): Promise<string | null> =>
    ipcRenderer.invoke("get-server-token"),
  getServerStatus: (): Promise<ServerStatus> =>
    ipcRenderer.invoke("get-server-status"),
  onServerStatusChange: (callback: (status: ServerStatus) => void) => {
    const handler = (_: unknown, status: ServerStatus) => callback(status);
    ipcRenderer.on("server-status-changed", handler);
    return () => ipcRenderer.removeListener("server-status-changed", handler);
  },
  restartServer: (): Promise<ServerStatus> =>
    ipcRenderer.invoke("restart-server"),
  openPath: (path: string) => ipcRenderer.invoke("open-path", path),
  openDataDir: () => ipcRenderer.invoke("open-data-dir"),
  listOpenWithApps: (): Promise<OpenWithApp[]> =>
    ipcRenderer.invoke("list-open-with-apps"),
  getOpenWithAppIcon: (appId: string): Promise<string | null> =>
    ipcRenderer.invoke("get-open-with-app-icon", appId),
  openWorkspaceWithApp: (workspacePath: string, appId?: string) =>
    ipcRenderer.invoke("open-workspace-with-app", { workspacePath, appId }),
  openFileWithApp: (filePath: string, appId?: string) =>
    ipcRenderer.invoke("open-file-with-app", { filePath, appId }),
  openExternal: (url: string) => ipcRenderer.invoke("open-external", url),
  getFullscreen: () => ipcRenderer.invoke("get-fullscreen"),
  onFullscreenChange: (callback: (isFullscreen: boolean) => void) => {
    const handler = (_: unknown, isFullscreen: boolean) =>
      callback(isFullscreen);
    ipcRenderer.on("fullscreen-changed", handler);
    return () => ipcRenderer.removeListener("fullscreen-changed", handler);
  },
  getUpdateStatus: (): Promise<UpdateStatus> =>
    ipcRenderer.invoke("get-update-status"),
  checkForUpdates: (): Promise<UpdateStatus> =>
    ipcRenderer.invoke("check-for-updates"),
  downloadUpdate: (): Promise<void> => ipcRenderer.invoke("download-update"),
  installUpdate: (): Promise<void> => ipcRenderer.invoke("install-update"),
  onUpdateStatusChange: (callback: (status: UpdateStatus) => void) => {
    const handler = (_: unknown, status: UpdateStatus) => callback(status);
    ipcRenderer.on("update-status-changed", handler);
    return () => ipcRenderer.removeListener("update-status-changed", handler);
  },
  onSystemResume: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("system-resume", handler);
    return () => ipcRenderer.removeListener("system-resume", handler);
  },
});
