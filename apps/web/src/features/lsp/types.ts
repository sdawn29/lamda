/**
 * Client-side LSP types — minimal mirrors of the LSP shapes we care about.
 * Kept local so we don't pull vscode-languageserver-protocol into the browser
 * bundle.
 */

export interface Position {
  line: number
  character: number
}

export interface Range {
  start: Position
  end: Position
}

export interface Diagnostic {
  range: Range
  severity?: number // 1 = error, 2 = warning, 3 = info, 4 = hint
  source?: string
  message: string
  code?: string | number
}

export interface Location {
  uri: string
  range: Range
}

export interface LocationLink {
  targetUri: string
  targetRange: Range
  targetSelectionRange?: Range
  originSelectionRange?: Range
}

export interface MarkupContent {
  kind: "markdown" | "plaintext"
  value: string
}

export type HoverContents =
  | string
  | MarkupContent
  | Array<string | { kind: "markdown" | "plaintext"; value: string; language?: string }>

export interface Hover {
  contents: HoverContents
  range?: Range
}

export interface ParameterInformation {
  label: string | [number, number]
  documentation?: string | MarkupContent
}

export interface SignatureInformation {
  label: string
  documentation?: string | MarkupContent
  parameters?: ParameterInformation[]
  activeParameter?: number
}

export interface SignatureHelp {
  signatures: SignatureInformation[]
  activeSignature?: number
  activeParameter?: number
}

export interface DocumentSymbol {
  name: string
  detail?: string
  kind: number
  range: Range
  selectionRange?: Range
  children?: DocumentSymbol[]
}

export interface SymbolInformation {
  name: string
  kind: number
  location: Location
}

export type DocumentSymbolResult = DocumentSymbol[] | SymbolInformation[]

export const SEVERITY_ERROR = 1
export const SEVERITY_WARNING = 2
export const SEVERITY_INFO = 3
export const SEVERITY_HINT = 4
