export type SelectFolderOptions = Parameters<
  NonNullable<Window["electronAPI"]>["selectFolder"]
>[0]

export type OpenWithApp = Awaited<
  ReturnType<NonNullable<Window["electronAPI"]>["listOpenWithApps"]>
>[number]

function getElectronAPI() {
  if (typeof window === "undefined") {
    return undefined
  }

  return window.electronAPI
}

export function getElectronPlatform(): string | null {
  return getElectronAPI()?.platform ?? null
}

export async function selectFolder(
  options?: SelectFolderOptions
): Promise<string | null> {
  return (await getElectronAPI()?.selectFolder(options)) ?? null
}

export async function getServerPort(): Promise<number | null> {
  return (await getElectronAPI()?.getServerPort()) ?? null
}

export type ElectronServerStatus = ServerStatus

export async function getServerStatus(): Promise<ElectronServerStatus> {
  const result = await getElectronAPI()?.getServerStatus()
  if (result) return result
  // Non-Electron (browser dev): treat as ready so the app proceeds against VITE_SERVER_URL.
  return { status: "ready", port: null, error: null }
}

export function subscribeToServerStatus(
  callback: (status: ElectronServerStatus) => void
): () => void {
  return getElectronAPI()?.onServerStatusChange(callback) ?? (() => {})
}

export async function restartServer(): Promise<ElectronServerStatus> {
  const result = await getElectronAPI()?.restartServer()
  if (result) return result
  return { status: "ready", port: null, error: null }
}

export async function openPath(path: string): Promise<boolean> {
  const electronAPI = getElectronAPI()
  if (!electronAPI?.openPath) {
    return false
  }

  await electronAPI.openPath(path)
  return true
}

export async function listOpenWithApps(): Promise<OpenWithApp[]> {
  return (await getElectronAPI()?.listOpenWithApps()) ?? []
}

export async function getOpenWithAppIcon(
  appId: string
): Promise<string | null> {
  return (await getElectronAPI()?.getOpenWithAppIcon(appId)) ?? null
}

export async function openWorkspaceWithApp(
  workspacePath: string,
  appId?: string
): Promise<boolean> {
  const electronAPI = getElectronAPI()
  if (!electronAPI?.openWorkspaceWithApp) {
    return false
  }

  await electronAPI.openWorkspaceWithApp(workspacePath, appId)
  return true
}

export async function openExternal(url: string): Promise<boolean> {
  const electronAPI = getElectronAPI()
  if (!electronAPI?.openExternal) {
    return false
  }

  await electronAPI.openExternal(url)
  return true
}

export async function getFullscreen(): Promise<boolean> {
  return (await getElectronAPI()?.getFullscreen()) ?? false
}

export function subscribeToFullscreen(
  callback: (isFullscreen: boolean) => void
): () => void {
  return getElectronAPI()?.onFullscreenChange(callback) ?? (() => {})
}

export type ElectronUpdateStatus = UpdateStatus

export async function getUpdateStatus(): Promise<ElectronUpdateStatus> {
  return (await getElectronAPI()?.getUpdateStatus()) ?? { phase: "idle" }
}

export function subscribeToUpdateStatus(
  callback: (status: ElectronUpdateStatus) => void
): () => void {
  return getElectronAPI()?.onUpdateStatusChange(callback) ?? (() => {})
}

export async function checkForUpdates(): Promise<ElectronUpdateStatus> {
  return (await getElectronAPI()?.checkForUpdates()) ?? { phase: "idle" }
}

export async function downloadUpdate(): Promise<void> {
  await getElectronAPI()?.downloadUpdate()
}

export async function installUpdate(): Promise<void> {
  await getElectronAPI()?.installUpdate()
}
