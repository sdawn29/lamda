interface ElectronAPI {
  platform: string
  selectFolder: () => Promise<string | null>
  getServerPort: () => Promise<number>
  openPath: (path: string) => Promise<void>
  openExternal: (url: string) => Promise<void>
  getFullscreen: () => Promise<boolean>
  onFullscreenChange: (callback: (isFullscreen: boolean) => void) => () => void
}

declare interface Window {
  electronAPI?: ElectronAPI
}
