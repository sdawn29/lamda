interface SelectFolderOptions {
  canCreateFolder?: boolean
}

interface OpenWithApp {
  id: string
  name: string
  iconDataUrl: string | null
}

interface ServerStatus {
  status: "starting" | "ready" | "failed"
  port: number | null
  error: string | null
}

interface ElectronAPI {
  platform: string
  selectFolder: (options?: SelectFolderOptions) => Promise<string | null>
  getServerPort: () => Promise<number | null>
  getServerStatus: () => Promise<ServerStatus>
  onServerStatusChange: (callback: (status: ServerStatus) => void) => () => void
  restartServer: () => Promise<ServerStatus>
  openPath: (path: string) => Promise<void>
  listOpenWithApps: () => Promise<OpenWithApp[]>
  getOpenWithAppIcon: (appId: string) => Promise<string | null>
  openWorkspaceWithApp: (workspacePath: string, appId?: string) => Promise<void>
  openExternal: (url: string) => Promise<void>
  getFullscreen: () => Promise<boolean>
  onFullscreenChange: (callback: (isFullscreen: boolean) => void) => () => void
}

declare interface Window {
  electronAPI?: ElectronAPI
}

declare const __APP_VERSION__: string
