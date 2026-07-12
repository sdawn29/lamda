import { createContext, useContext, useMemo, type ReactNode } from "react"
import {
  parseStatusLines,
  type ChangedFile,
} from "@/features/git/components/status-badge"
import { useGitStatus } from "@/features/git/queries"

/**
 * Git-status lookup shared by every file chip in a transcript. Mounted once
 * per chat view (see chat-view.tsx) rather than threaded through
 * `getMarkdownComponents`, whose component map is cached per rootPath and
 * would otherwise go stale the moment the working tree changes.
 */
export interface FileChipGitInfo {
  /** Changed files keyed by their git-relative path (as returned by `git status`). */
  changedFiles: Map<string, ChangedFile>
  rootPath?: string
}

const FileChipContext = createContext<FileChipGitInfo | null>(null)

export function FileChipGitProvider({
  sessionId,
  rootPath,
  children,
}: {
  sessionId: string
  rootPath?: string
  children: ReactNode
}) {
  const { data } = useGitStatus(sessionId)
  const changedFiles = useMemo(
    () => buildChangedFileMap(data?.raw ?? ""),
    [data?.raw]
  )
  const value = useMemo<FileChipGitInfo>(
    () => ({ changedFiles, rootPath }),
    [changedFiles, rootPath]
  )

  return (
    <FileChipContext.Provider value={value}>
      {children}
    </FileChipContext.Provider>
  )
}

/** Parses `git status --porcelain` output into a path→ChangedFile lookup. */
export function buildChangedFileMap(raw: string): Map<string, ChangedFile> {
  const map = new Map<string, ChangedFile>()
  if (!raw) return map
  for (const file of parseStatusLines(raw)) {
    map.set(file.filePath, file)
  }
  return map
}

/**
 * Resolves a chip's path (relative or absolute) against the changed-files map.
 * Git status paths are always workspace-relative, so we try a direct relative
 * match first, then strip `rootPath` off an absolute chip path, then fall back
 * to a suffix match for paths that don't cleanly resolve either way (e.g. a
 * chip rendered before `rootPath` is known, or a path copied from elsewhere).
 */
export function findChangedFile(
  path: string,
  rootPath: string | undefined,
  changedFiles: Map<string, ChangedFile>
): ChangedFile | undefined {
  if (changedFiles.size === 0) return undefined
  const trimmed = path.replace(/^\.\//, "").replace(/\/+$/, "")

  const direct = changedFiles.get(trimmed)
  if (direct) return direct

  if (trimmed.startsWith("/") && rootPath) {
    const root = rootPath.replace(/\/$/, "")
    if (trimmed.startsWith(`${root}/`)) {
      const relMatch = changedFiles.get(trimmed.slice(root.length + 1))
      if (relMatch) return relMatch
    }
  }

  for (const [key, file] of changedFiles) {
    if (
      key === trimmed ||
      key.endsWith(`/${trimmed}`) ||
      trimmed.endsWith(`/${key}`)
    ) {
      return file
    }
  }
  return undefined
}

/** Reads the changed-file entry for `path` from the nearest FileChipGitProvider.
 *  Returns undefined outside a provider (no dot) or when the path isn't changed. */
export function useFileChipGitStatus(path: string): ChangedFile | undefined {
  const ctx = useContext(FileChipContext)
  if (!ctx) return undefined
  return findChangedFile(path, ctx.rootPath, ctx.changedFiles)
}

/** Workspace root from the nearest FileChipGitProvider — lets chips rendered
 *  without an explicit rootPath prop (e.g. user @-mentions) resolve relative
 *  paths and open files. Undefined outside a provider. */
export function useFileChipRootPath(): string | undefined {
  return useContext(FileChipContext)?.rootPath
}
