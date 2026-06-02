// Type shims for deep monaco-editor entry points that ship JS without their
// own `.d.ts`. Vite resolves the `?worker` suffix to a Worker constructor.

declare module "*?worker" {
  const WorkerCtor: { new (): Worker }
  export default WorkerCtor
}

declare module "monaco-editor/esm/vs/language/typescript/monaco.contribution" {
  interface TsLanguageServiceDefaults {
    setDiagnosticsOptions(options: {
      noSemanticValidation?: boolean
      noSyntaxValidation?: boolean
      noSuggestionDiagnostics?: boolean
    }): void
  }
  export const typescriptDefaults: TsLanguageServiceDefaults
  export const javascriptDefaults: TsLanguageServiceDefaults
}
