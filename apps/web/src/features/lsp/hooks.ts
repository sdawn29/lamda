/**
 * React hooks built on top of LspConnection.
 *
 * - useLspConnection(workspaceId): returns the shared LspConnection or null.
 * - useResolveWorkspaceId(workspacePath): map a workspace path → workspaceId.
 * - useOpenDocument(connection, filePath, content): opens for the lifetime
 *   of the calling component; closes on unmount.
 * - useFileDiagnostics(connection, filePath): live diagnostics for one file.
 * - useDocumentSymbols(connection, filePath, enabled): fetched once per file.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react"
import { useWorkspaces } from "@/features/workspace"
import { getLspConnection, type LspConnection } from "./client"
import type { Diagnostic, DocumentSymbolResult } from "./types"

const EMPTY_DIAGS: Diagnostic[] = []

export function useLspConnection(workspaceId: string | null | undefined): LspConnection | null {
  return useMemo(() => (workspaceId ? getLspConnection(workspaceId) : null), [workspaceId])
}

export function useResolveWorkspaceId(workspacePath: string | undefined): string | null {
  const { data: workspaces = [] } = useWorkspaces()
  return useMemo(() => {
    if (!workspacePath) return null
    return workspaces.find((w) => w.path === workspacePath)?.id ?? null
  }, [workspaces, workspacePath])
}

/**
 * Open a file with the LSP server for as long as this hook is mounted.
 * Re-opens on content change so diagnostics stay accurate.
 */
export function useOpenDocument(
  connection: LspConnection | null,
  filePath: string | null,
  content: string | null,
) {
  useEffect(() => {
    if (!connection || !filePath || content === null) return
    void connection.openDocument(filePath, content).catch((err) => {
      console.warn("[lsp] openDocument failed:", err)
    })
    return () => {
      void connection.closeDocument(filePath).catch(() => {
        // Connection might already be closing during teardown.
      })
    }
  }, [connection, filePath, content])
}

export function useFileDiagnostics(
  connection: LspConnection | null,
  filePath: string | null,
): Diagnostic[] {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!connection || !filePath) return () => {}
      return connection.subscribeDiagnostics((path) => {
        if (path === filePath) onChange()
      })
    },
    [connection, filePath],
  )
  const getSnapshot = useCallback((): Diagnostic[] => {
    if (!connection || !filePath) return EMPTY_DIAGS
    return connection.getDiagnostics(filePath)
  }, [connection, filePath])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/**
 * Async-fetch document symbols whenever the file or enabled flag changes.
 * Stores the result keyed by file path so a switch between files resets cleanly
 * without writing setState during the effect body.
 */
export function useDocumentSymbols(
  connection: LspConnection | null,
  filePath: string | null,
  enabled: boolean,
): DocumentSymbolResult | null {
  const targetKey = enabled && connection && filePath ? filePath : ""
  const [state, setState] = useState<{ key: string; symbols: DocumentSymbolResult | null }>({
    key: "",
    symbols: null,
  })

  useEffect(() => {
    if (!targetKey || !connection || !filePath) return
    let cancelled = false
    const t = setTimeout(() => {
      void connection
        .documentSymbols(filePath)
        .then((result) => {
          if (!cancelled) setState({ key: targetKey, symbols: result })
        })
        .catch(() => {
          if (!cancelled) setState({ key: targetKey, symbols: null })
        })
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [targetKey, connection, filePath])

  return state.key === targetKey ? state.symbols : null
}
