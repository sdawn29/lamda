export { getLspConnection, disposeLspConnection, LspConnection } from "./client"
export { MonacoCodeViewer } from "./components/monaco-code-viewer-lazy"
export { ProblemsStrip } from "./components/problems-strip"
export { OutlinePanel } from "./components/outline-panel"
export { LspSettingsCard } from "./components/lsp-settings-card"
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
  MarkupContent,
  ParameterInformation,
  Position,
  Range,
  SignatureHelp,
  SignatureInformation,
  SymbolInformation,
} from "./types"
export {
  SEVERITY_ERROR,
  SEVERITY_WARNING,
  SEVERITY_INFO,
  SEVERITY_HINT,
} from "./types"
export { useLspRegistry, lspKeys } from "./queries"
export type {
  LspRegistryEntry,
  LspRegistryFallback,
} from "./api"
