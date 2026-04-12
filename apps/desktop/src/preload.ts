import { contextBridge, ipcRenderer } from "electron";

type SelectFolderOptions = {
  canCreateFolder?: boolean;
};

type OpenWithApp = {
  id: string;
  name: string;
  iconDataUrl: string | null;
};

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  selectFolder: (options?: SelectFolderOptions) =>
    ipcRenderer.invoke("select-folder", options),
  getServerPort: () => ipcRenderer.invoke("get-server-port"),
  openPath: (path: string) => ipcRenderer.invoke("open-path", path),
  listOpenWithApps: (): Promise<OpenWithApp[]> =>
    ipcRenderer.invoke("list-open-with-apps"),
  getOpenWithAppIcon: (appId: string): Promise<string | null> =>
    ipcRenderer.invoke("get-open-with-app-icon", appId),
  openWorkspaceWithApp: (workspacePath: string, appId?: string) =>
    ipcRenderer.invoke("open-workspace-with-app", { workspacePath, appId }),
  openExternal: (url: string) => ipcRenderer.invoke("open-external", url),
  getFullscreen: () => ipcRenderer.invoke("get-fullscreen"),
  onFullscreenChange: (callback: (isFullscreen: boolean) => void) => {
    const handler = (_: unknown, isFullscreen: boolean) =>
      callback(isFullscreen);
    ipcRenderer.on("fullscreen-changed", handler);
    return () => ipcRenderer.removeListener("fullscreen-changed", handler);
  },
});
