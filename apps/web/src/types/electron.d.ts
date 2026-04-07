interface ElectronAPI {
  platform: string
  selectFolder: () => Promise<string | null>
  getServerPort: () => Promise<number>
  openPath: (path: string) => Promise<void>
  gitStatus: (cwd: string) => Promise<string>
  gitFileDiff: (cwd: string, filePath: string, statusCode: string) => Promise<string>
  gitCommit: (cwd: string, message: string) => Promise<string>
}

declare interface Window {
  electronAPI?: ElectronAPI
}
