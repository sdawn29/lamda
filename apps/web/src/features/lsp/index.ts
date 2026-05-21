export { getLspConnection, disposeLspConnection, LspConnection } from "./client"
export { LspCodeViewer } from "./components/lsp-code-viewer"
export { ProblemsStrip } from "./components/problems-strip"
export { OutlinePanel } from "./components/outline-panel"
export {
  useLspConnection,
  useResolveWorkspaceId,
  useOpenDocument,
  useFileDiagnostics,
  useDocumentSymbols,
} from "./hooks"
export type {
  Diagnostic,
  DocumentSymbol,
  DocumentSymbolResult,
  Hover,
  Location,
  LocationLink,
  Position,
  Range,
  SymbolInformation,
} from "./types"
export {
  SEVERITY_ERROR,
  SEVERITY_WARNING,
  SEVERITY_INFO,
  SEVERITY_HINT,
} from "./types"
